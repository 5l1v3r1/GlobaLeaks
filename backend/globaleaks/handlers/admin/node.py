# -*- coding: utf-8
#
#   /admin/node
#   *****
# Implementation of the code executed on handler /admin/node
from twisted.internet.defer import inlineCallbacks, returnValue

from globaleaks import models, utils, LANGUAGES_SUPPORTED_CODES, LANGUAGES_SUPPORTED
from globaleaks.db import db_refresh_memory_variables
from globaleaks.db.appdata import load_appdata
from globaleaks.handlers.base import BaseHandler
from globaleaks.handlers.user import can_edit_general_settings_or_raise
from globaleaks.models.config import ConfigFactory, ConfigL10NFactory
from globaleaks.orm import tw
from globaleaks.rest import errors, requests
from globaleaks.state import State
from globaleaks.utils.ip import parse_csv_ip_ranges_to_ip_networks
from globaleaks.utils.log import log


def db_admin_serialize_node(session, tid, language, config_node='admin_node'):
    config = ConfigFactory(session, tid).serialize(config_node)

    misc_dict = {
        'languages_supported': LANGUAGES_SUPPORTED,
        'languages_enabled': models.EnabledLanguage.list(session, tid),
        'root_tenant': tid == 1,
        'https_possible': tid == 1 or State.tenant_cache[1].reachable_via_web,
    }

    if tid != 1:
        root_tenant_node = ConfigFactory(session, 1)
        misc_dict['version'] = root_tenant_node.get_val('version')
        misc_dict['latest_version'] = root_tenant_node.get_val('latest_version')

    l10n_dict = ConfigL10NFactory(session, tid).serialize('node', language)

    return utils.sets.merge_dicts(config, misc_dict, l10n_dict)


def db_update_enabled_languages(session, tid, languages_enabled, default_language):
    cur_enabled_langs = models.EnabledLanguage.list(session, tid)
    new_enabled_langs = [y for y in languages_enabled]

    if len(new_enabled_langs) < 1:
        raise errors.InputValidationError("No languages enabled!")

    if default_language not in new_enabled_langs:
        raise errors.InputValidationError("Invalid lang code for chosen default_language")

    appdata = None
    for lang_code in new_enabled_langs:
        if lang_code not in LANGUAGES_SUPPORTED_CODES:
            raise errors.InputValidationError("Invalid lang code: %s" % lang_code)

        if lang_code not in cur_enabled_langs:
            if appdata is None:
                appdata = load_appdata()
            log.debug("Adding a new lang %s" % lang_code)
            models.config.add_new_lang(session, tid, lang_code, appdata)

    to_remove = list(set(cur_enabled_langs) - set(new_enabled_langs))
    if to_remove:
        session.query(models.User).filter(models.User.tid == tid, models.User.language.in_(to_remove)).update({'language': default_language}, synchronize_session='fetch')
        session.query(models.EnabledLanguage).filter(models.EnabledLanguage.tid == tid, models.EnabledLanguage.name.in_(to_remove)).delete(synchronize_session='fetch')


def db_update_node(session, tid, request, language):
    """
    Update and serialize the node infos

    :param tid:
    :param request:
    :param session: the session on which perform queries.
    :param language: the language in which to localize data
    :return: a dictionary representing the serialization of the node
    """
    config = ConfigFactory(session, tid)

    config.update('node', request)

    if 'basic_auth' in request and request['basic_auth'] and request['basic_auth_username'] and request['basic_auth_password']:
        config.set_val('basic_auth', True)
        config.set_val('basic_auth_username', request['basic_auth_username'])
        config.set_val('basic_auth_password', request['basic_auth_password'])
    else:
        config.set_val('basic_auth', False)
        config.set_val('basic_auth_username', '')
        config.set_val('basic_auth_password', '')

    if request['enable_ricochet_panel'] and not request['ricochet_address']:
        request['enable_ricochet_panel'] = False

    # Validate that IP addresses/ranges we're getting are goo
    if 'ip_filter_admin' in request and request['ip_filter_admin_enable'] and request['ip_filter_admin']:
        parse_csv_ip_ranges_to_ip_networks(request['ip_filter_admin'])

    if 'ip_filter_whistleblower_enable' in request and request['ip_filter_whistleblower_enable'] and request['ip_filter_whistleblower']:
        parse_csv_ip_ranges_to_ip_networks(request['ip_filter_whistleblower'])

    if 'languages_enabled' in request and 'default_language' in request:
        db_update_enabled_languages(session,
                                    tid,
                                    request['languages_enabled'],
                                    request['default_language'])

    if language in models.EnabledLanguage.list(session, tid):
        ConfigL10NFactory(session, tid).update('node', request, language)

    db_refresh_memory_variables(session, [tid])

    if tid == 1:
        log.setloglevel(config.get_val('log_level'))

    return db_admin_serialize_node(session, tid, language)


class NodeInstance(BaseHandler):
    check_roles = 'user'
    cache_resource = True
    invalidate_cache = True

    @inlineCallbacks
    def determine_allow_config_filter(self):
        """Determines what filters are allowed, else throws invalid authentication"""
        if self.current_user.user_role == 'admin':
            node = ('admin_node', requests.AdminNodeDesc)
        else:
            yield can_edit_general_settings_or_raise(self)
            node = ('general_settings', requests.SiteSettingsDesc)

        returnValue(node)

    @inlineCallbacks
    def get(self):
        """
        Get the node infos.
        """
        config_node = yield self.determine_allow_config_filter()
        serialized_node = yield tw(db_admin_serialize_node,
                                   self.request.tid,
                                   self.request.language,
                                   config_node=config_node[0])
        returnValue(serialized_node)

    @inlineCallbacks
    def put(self):
        """
        Update the node infos.
        """

        config_node = yield self.determine_allow_config_filter()

        request = yield self.validate_message(self.request.content.read(),
                                              config_node[1])

        serialized_node = yield tw(db_update_node,
                                   self.request.tid,
                                   request,
                                   self.request.language)
        returnValue(serialized_node)
