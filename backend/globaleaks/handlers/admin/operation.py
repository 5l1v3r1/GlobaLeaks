# -*- coding: utf-8
from twisted.internet.defer import inlineCallbacks, returnValue

from globaleaks.db import db_refresh_memory_variables
from globaleaks.handlers.operation import OperationHandler
from globaleaks.handlers.password_reset import generate_password_reset_token
from globaleaks.handlers.rtip import db_delete_itip
from globaleaks.handlers.user import disable_2fa
from globaleaks.models import Config, InternalTip
from globaleaks.models.config import db_set_config_variable
from globaleaks.orm import transact, tw
from globaleaks.rest import errors
from globaleaks.services.onion import set_onion_service_info, get_onion_service_info


@transact
def check_hostname(session, tid, input_hostname):
    """
    Ensure the hostname does not collide across tenants or
    include an origin that it shouldn't.
    """

    forbidden_endings = ['onion', 'localhost']

    for v in forbidden_endings:
        if input_hostname.endswith(v):
            raise errors.InputValidationError('Hostname contains a forbidden origin')

    existing_hostnames = {h.value for h in session.query(Config)
                                                  .filter(Config.tid != tid,
                                                          Config.var_name == 'hostname')}

    if input_hostname in existing_hostnames:
        raise errors.InputValidationError('Hostname already reserved')


@transact
def reset_submissions(session, tid):
    session.query(Config).filter(Config.tid == tid, Config.var_name == 'counter_submissions').update({'value': 0})

    for itip in session.query(InternalTip).filter(InternalTip.tid == tid):
        db_delete_itip(session, itip)


class AdminOperationHandler(OperationHandler):
    """
    This interface exposes the enable to configure and verify the platform hostname
    """
    check_roles = 'admin'
    invalidate_cache = True

    def disable_2fa(self, req_args, *args, **kwargs):
        return disable_2fa(self.request.tid, req_args['value'])

    @inlineCallbacks
    def set_hostname(self, req_args, *args, **kwargs):
        yield check_hostname(self.request.tid, req_args['value'])
        yield tw(db_set_config_variable, self.request.tid, 'hostname', req_args['value'])
        yield tw(db_refresh_memory_variables, [self.request.tid])
        self.state.tenant_cache[self.request.tid].hostname = req_args['value']

    def reset_user_password(self, req_args, *args, **kwargs):
        return generate_password_reset_token(self.state,
                                             self.request.tid,
                                             req_args['value'])

    @inlineCallbacks
    def reset_onion_private_key(self, req_args, *args, **kargs):
        yield set_onion_service_info(self.request.tid, '', '')
        yield self.state.onion_service_job.add_hidden_service(self.request.tid, '', '')
        yield self.state.onion_service_job.remove_unwanted_hidden_services()

        onion_details = yield get_onion_service_info(self.request.tid)
        returnValue({
            'onionservice': onion_details[1]
        })

    def reset_submissions(self, req_args, *args, **kwargs):
        return reset_submissions(self.request.tid)

    def operation_descriptors(self):
        return {
            'disable_2fa': (AdminOperationHandler.disable_2fa, {'value': str}),
            'reset_onion_private_key': (AdminOperationHandler.reset_onion_private_key, {}),
            'reset_submissions': (AdminOperationHandler.reset_submissions, {}),
            'reset_user_password': (AdminOperationHandler.reset_user_password, {'value': str}),
            'set_hostname': (AdminOperationHandler.set_hostname, {'value': str})
        }
