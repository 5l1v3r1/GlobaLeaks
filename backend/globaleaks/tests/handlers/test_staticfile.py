# -*- coding: utf-8 -*-
from twisted.internet.defer import inlineCallbacks

from globaleaks.handlers.staticfile import StaticFileHandler
from globaleaks.rest import errors
from globaleaks.settings import Settings
from globaleaks.tests import helpers

FUTURE = 100


class TestStaticFileHandler(helpers.TestHandler):
    _handler = StaticFileHandler

    @inlineCallbacks
    def test_get_existent(self):
        handler = self.request(kwargs={'path': Settings.client_path})
        yield handler.get('')
        self.assertTrue(handler.request.getResponseBody().decode().startswith('<!doctype html>'))

    def test_get_unexistent(self):
        handler = self.request(kwargs={'path': Settings.client_path})

        return self.assertRaises(errors.ResourceNotFound, handler.get, 'unexistent')
