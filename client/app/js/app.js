/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^GLClient|\$locale$" }] */

var _flowFactoryProvider;

var GLClient = angular.module("GLClient", [
    "angular.filter",
    "ngAria",
    "ngRoute",
    "ui.bootstrap",
    "ui.select",
    "tmh.dynamicLocale",
    "flow",
    "monospaced.qrcode",
    "pascalprecht.translate",
    "ngSanitize",
    "ngFileSaver",
    "GLCrypto",
    "GLDirectives",
    "GLFilters",
    "GLServices"
]).
  config(["$compileProvider", function($compileProvider) {
    $compileProvider.debugInfoEnabled(false);
}]).
  config(["$httpProvider", function($httpProvider) {
    $httpProvider.interceptors.push("globaleaksRequestInterceptor");
}]).
  config(["$locationProvider", function($locationProvider) {
    $locationProvider.hashPrefix("");
}]).
  config(["$provide", function($provide) {
    $provide.decorator("$templateRequest", ["$delegate", function($delegate) {
      // This decorator is required in order to inject the 'true' for setting ignoreRequestError
      // in relation to https://docs.angularjs.org/error/$compile/tpload
      var fn = $delegate;

      $delegate = function(tpl) {
        for (var key in fn) {
          $delegate[key] = fn[key];
        }

        return fn.apply(this, [tpl, true]);
      };

      return $delegate;
    }]);

    $provide.decorator("$exceptionHandler", ["$delegate", "$injector", "stacktraceService", function ($delegate, $injector, stacktraceService) {
      var uuid4RE = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g;
      var uuid4Empt = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
      // Note this RE is different from our usual email validator
      var emailRE = /(([\w+-.]){0,100}[\w]{1,100}@([\w+-.]){0,100}.[\w]{1,100})/g;
      var emailEmpt = "~~~~~~@~~~~~~";

      function scrub(s) {
      var cleaner = s.replace(uuid4RE, uuid4Empt);
        cleaner = s.replace(emailRE, emailEmpt);
        return cleaner;
      }

      return function(exception, cause) {
          var $rootScope = $injector.get("$rootScope");

          if (typeof $rootScope.exceptions_count === "undefined") {
            $rootScope.exceptions_count = 0;
          }

          $rootScope.exceptions_count += 1;

          if ($rootScope.exceptions_count >= 3) {
            // Give each client the ability to forward only the first 3 exceptions
            // scattered; this is also important to avoid looping exceptions to
            // cause looping POST requests.
            return;
          }

          $delegate(exception, cause);

          stacktraceService.fromError(exception).then(function(result) {
              var errorData = angular.toJson({
              errorUrl: $injector.get("$location").path(),
              errorMessage: exception.toString(),
              stackTrace: result,
              agent: navigator.userAgent
            });

            $injector.get("$http").post("exception", scrub(errorData));
          });
      };
    }]);
}]).
  config(["$qProvider", function($qProvider) {
    $qProvider.errorOnUnhandledRejections(false);
}]).
  config(["$rootScopeProvider", function($rootScopeProvider) {
    // Raise the default digest loop limit to 30 because of the template recursion used by fields:
    // https://github.com/angular/angular.js/issues/6440
    $rootScopeProvider.digestTtl(30);
}]).
  config(["$routeProvider", function($routeProvider) {
    function requireAuth(role) {
      return ["Access", function(Access) { return Access.isAuthenticated(role); }];
    }

    function noAuth() {
      return ["Access", function(Access) { return Access.isUnauth(); }];
    }

    function allKinds() {
      return ["Access", function(Access) { return Access.OK; }];
    }

    function fetchResources(role, lst) {
      return ["$q", "$rootScope", "Access", "AdminContextResource", "AdminQuestionnaireResource", "AdminStepResource", "AdminFieldResource", "AdminFieldTemplateResource", "AdminUserResource", "AdminNodeResource", "AdminNotificationResource", "AdminRedirectResource", "AdminTenantResource", "FieldAttrs", "ActivitiesCollection", "AnomaliesCollection", "JobsAuditLog", "ManifestResource", "AdminSubmissionStatusResource", function($q, $rootScope, Access, AdminContextResource, AdminQuestionnaireResource, AdminStepResource, AdminFieldResource, AdminFieldTemplateResource, AdminUserResource, AdminNodeResource, AdminNotificationResource, AdminRedirectResource, AdminTenantResource, FieldAttrs, ActivitiesCollection, AnomaliesCollection, JobsAuditLog, ManifestResource, AdminSubmissionStatusResource) {
        var resourcesPromises = {
          node: function() { return AdminNodeResource.get().$promise; },
          manifest: function() { return ManifestResource.get().$promise; },
          contexts: function() { return AdminContextResource.query().$promise; },
          field_attrs: function() { return FieldAttrs.get().$promise; },
          fieldtemplates: function() { return AdminFieldTemplateResource.query().$promise; },
          users: function() { return AdminUserResource.query().$promise; },
          notification: function() { return AdminNotificationResource.get().$promise; },
          redirects: function() { return AdminRedirectResource.query().$promise; },
          tenants: function() { return AdminTenantResource.query().$promise; },
          activities: function() { return ActivitiesCollection.query().$promise; },
          anomalies: function() { return AnomaliesCollection.query().$promise; },
          jobs: function() { return JobsAuditLog.query().$promise; },
          questionnaires: function() { return AdminQuestionnaireResource.query().$promise; },
          submission_statuses: function() { return AdminSubmissionStatusResource.query().$promise; },
        };

        return Access.isAuthenticated(role).then(function() {
          var promises = {};

          for (var i = 0; i < lst.length; i++) {
             var name = lst[i];
             promises[name] = resourcesPromises[name]();
          }

          return $q.all(promises).then(function(resources) {
            $rootScope.resources = resources;
          });
        });
      }];
    }

    $routeProvider.
      when("/wizard", {
        templateUrl: "views/wizard/main.html",
        controller: "WizardCtrl",
        header_title: "Platform wizard",
        resolve: {
          access: allKinds()
        }
      }).
      when("/submission", {
        templateUrl: "views/whistleblower/submission.html",
        controller: "SubmissionCtrl",
        header_title: "",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/activation", {
        templateUrl: "views/signup/activation.html",
        controller: "SignupActivationCtrl",
        header_title: "Create your whistleblowing platform",
        resolve: {
          access: allKinds(),
        }
      }).
      when("/status/:tip_id", {
        templateUrl: "views/recipient/tip.html",
        controller: "TipCtrl",
        header_title: "",
        resolve: {
          access: requireAuth("receiver"),
        }
      }).
      when("/actions/forcedpasswordchange", {
        templateUrl: "views/actions/forced_password_change.html",
        controller: "ForcedPasswordChangeCtrl",
        header_title: "Change your password",
        resolve: {
          access: requireAuth("*"),
        }
      }).
      when("/actions/forcedtwofactor", {
        templateUrl: "views/actions/forced_two_factor.html",
        controller: "EnableTwoFactorAuthCtrl",
        header_title: "Enable two factor authentication",
        resolve: {
          access: requireAuth("*"),
        }
      }).
      when("/recipient/home", {
        templateUrl: "views/recipient/home.html",
        header_title: "Home",
        sidebar: "views/recipient/sidebar.html",
        resolve: {
          access: requireAuth("receiver"),
        }
      }).
      when("/recipient/preferences", {
        templateUrl: "views/recipient/preferences.html",
        header_title: "Preferences",
        sidebar: "views/recipient/sidebar.html",
        resolve: {
          access: requireAuth("receiver"),
        }
      }).
      when("/recipient/content", {
        templateUrl: "views/recipient/content.html",
        controller: "AdminCtrl",
        header_title: "Site settings",
        sidebar: "views/recipient/sidebar.html",
        resolve: {
          resources: fetchResources("acl", ["node"]),
        }
      }).
      when("/recipient/reports", {
        templateUrl: "views/recipient/tips.html",
        controller: "ReceiverTipsCtrl",
        header_title: "Reports",
        resolve: {
          access: requireAuth("receiver"),
        }
      }).
      when("/admin/home", {
        templateUrl: "views/admin/home.html",
        controller: "AdminCtrl",
        header_title: "Home",
        sidebar: "views/admin/sidebar.html",
        resolve: {
           access: requireAuth("admin"),
          resources: fetchResources("acl", ["manifest", "node"]),
        }
      }).
      when("/admin/preferences", {
        templateUrl: "views/admin/preferences.html",
        controller: "AdminCtrl",
        header_title: "Preferences",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node"]),
        }
      }).
      when("/admin/content", {
        templateUrl: "views/admin/content.html",
        controller: "AdminCtrl",
        header_title: "Site settings",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("acl", ["node"]),
        }
      }).
      when("/admin/contexts", {
        templateUrl: "views/admin/contexts.html",
        controller: "AdminCtrl",
        header_title: "Contexts",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["contexts", "node", "questionnaires", "users"]),
        }
      }).
      when("/admin/questionnaires", {
        templateUrl: "views/admin/questionnaires.html",
        controller: "AdminCtrl",
        header_title: "Questionnaires",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["fieldtemplates", "field_attrs", "node", "questionnaires", "users"]),
        }
      }).
      when("/admin/users", {
        templateUrl: "views/admin/users.html",
        controller: "AdminCtrl",
        header_title: "Users",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "users"]),
        }
      }).
      when("/admin/notifications", {
        templateUrl: "views/admin/notifications.html",
        controller: "AdminCtrl",
        header_title: "Notification settings",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "notification"]),
        }
      }).
      when("/admin/network", {
        templateUrl: "views/admin/network.html",
        controller: "AdminCtrl",
        header_title: "Network settings",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "redirects"]),
        }
      }).
      when("/admin/advanced", {
        templateUrl: "views/admin/advanced.html",
        controller: "AdminCtrl",
        header_title: "Advanced settings",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "questionnaires"]),
        }
      }).
      when("/admin/auditlog", {
        templateUrl: "views/admin/auditlog.html",
        controller: "AdminCtrl",
        header_title: "Audit log",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "activities", "anomalies", "jobs", "users"]),
        }
      }).
      when("/admin/sites", {
        templateUrl: "views/admin/sites.html",
        controller: "AdminCtrl",
        header_title: "Sites management",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "tenants"]),
        }
      }).
      when("/admin/casemanagement", {
        templateUrl: "views/admin/casemanagement.html",
        controller: "AdminCtrl",
        header_title: "Case management",
        sidebar: "views/admin/sidebar.html",
        resolve: {
          access: requireAuth("admin"),
          resources: fetchResources("admin", ["node", "submission_statuses"]),
        }
      }).
      when("/custodian/home", {
        templateUrl: "views/custodian/home.html",
        header_title: "Home",
        sidebar: "views/custodian/sidebar.html",
        resolve: {
          access: requireAuth("custodian"),
        }
      }).
      when("/custodian/preferences", {
        templateUrl: "views/custodian/preferences.html",
        header_title: "Preferences",
        sidebar: "views/custodian/sidebar.html",
        resolve: {
          access: requireAuth("custodian"),
        }
      }).
      when("/custodian/content", {
        templateUrl: "views/custodian/content.html",
        controller: "AdminCtrl",
        header_title: "Site settings",
        sidebar: "views/custodian/sidebar.html",
        resolve: {
          access: requireAuth("custodian"),
          resources: fetchResources("acl", ["node"]),
        }
      }).
      when("/custodian/identityaccessrequests", {
        templateUrl: "views/custodian/identity_access_requests.html",
        header_title: "Access requests",
        resolve: {
          access: requireAuth("custodian"),
        }
      }).
      when("/login", {
        templateUrl: "views/login/main.html",
        controller: "LoginCtrl",
        header_title: "Log in",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/admin", {
        templateUrl: "views/login/main.html",
        controller: "LoginCtrl",
        header_title: "Log in",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/multisitelogin", {
        templateUrl: "views/login/main.html",
        controller: "LoginCtrl",
        header_title: "Log in",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/receiptlogin", {
        templateUrl: "views/login/receipt.html",
        controller: "LoginCtrl",
        header_title: "",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/login/passwordreset", {
        templateUrl: "views/passwordreset/main.html",
        controller: "PasswordResetCtrl",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/login/passwordreset/requested", {
        templateUrl: "views/passwordreset/requested.html",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/login/passwordreset/failure/token", {
        templateUrl: "views/passwordreset/failure_token.html",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/login/passwordreset/failure/recovery", {
        templateUrl: "views/passwordreset/failure_recovery.html",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/password/reset", {
        templateUrl: "views/empty.html",
        controller: "PasswordResetCompleteCtrl",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/password/reset/2fa", {
        templateUrl: "views/passwordreset/2fa.html",
        controller: "PasswordResetCompleteCtrl",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/password/reset/recovery", {
        templateUrl: "views/passwordreset/recovery.html",
        controller: "PasswordResetCompleteCtrl",
        header_title: "Password reset",
        resolve: {
          access: noAuth()
        }
      }).
      when("/email/validation/success", {
        templateUrl: "views/email_validation_success.html",
        controller: "EmailValidationCtrl",
        header_title: "",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/email/validation/failure", {
        templateUrl: "views/email_validation_failure.html",
        controller: "EmailValidationCtrl",
        header_title: "",
        resolve: {
          access: noAuth(),
        }
      }).
      when("/", {
        templateUrl: "views/home.html",
        controller: "MainCtrl",
        header_title: ""
      }).
      otherwise({
        redirectTo: "/"
      });
}]).
  config(["$translateProvider", function($translateProvider) {
    $translateProvider.useStaticFilesLoader({
      prefix: "l10n/",
      suffix: ""
    });

    $translateProvider.useInterpolation("noopInterpolation");
    $translateProvider.useSanitizeValueStrategy("escape");
}]).
  config(["$uibModalProvider", function($uibModalProvider) {
    $uibModalProvider.options.backdrop = "static";
    $uibModalProvider.options.keyboard = false;
    $uibModalProvider.options.focus = true;
}]).
  config(["$uibTooltipProvider", function($uibTooltipProvider) {
    $uibTooltipProvider.options({appendToBody: true, trigger: "mouseenter"});
}]).
  config(["tmhDynamicLocaleProvider", function(tmhDynamicLocaleProvider) {
    var map = {
      "ca@valencia": "ca-es-valencia",
      "sl-si": "sl"
    };

    tmhDynamicLocaleProvider.addLocalePatternValue("map", map);

    tmhDynamicLocaleProvider.localeLocationPattern("{{map[locale] ? 'lib/js/locale/angular-locale_' + map[locale] +'.js' : 'lib/js/locale/angular-locale_' + locale +'.js'}}");
}]).
  config(["flowFactoryProvider", function (flowFactoryProvider) {
    // Trick to move the flowFactoryProvider config inside run block.
    _flowFactoryProvider = flowFactoryProvider;
}]).
  run(["$rootScope", "$http", "$route", "$routeParams", "$location",  "$filter", "$translate", "$uibModal", "$templateCache", "Authentication", "PublicResource", "Utils", "AdminUtils", "fieldUtilities", "GLTranslate", "Access",
      function($rootScope, $http, $route, $routeParams, $location, $filter, $translate, $uibModal, $templateCache, Authentication, PublicResource, Utils, AdminUtils, fieldUtilities, GLTranslate, Access) {
    var script;

    $rootScope.started = false;

    script = document.createElement("link");
    script.setAttribute("rel", "stylesheet");
    script.setAttribute("type", "text/css");
    script.setAttribute("href", "css/styles.css");
    document.getElementsByTagName("head")[0].appendChild(script);

    $rootScope.Authentication = Authentication;
    $rootScope.GLTranslate = GLTranslate;
    $rootScope.Utils = Utils;
    $rootScope.fieldUtilities = fieldUtilities;
    $rootScope.AdminUtils = AdminUtils;

    $rootScope.showLoadingPanel = false;
    $rootScope.successes = [];
    $rootScope.errors = [];
    $rootScope.embedded = $location.search().embedded === "true";

    _flowFactoryProvider.defaults = {
        chunkSize: 1000 * 1024,
        forceChunkSize: true,
        testChunks: false,
        simultaneousUploads: 1,
        generateUniqueIdentifier: function () {
          return Math.random() * 1000000 + 1000000;
        },
        headers: function() {
          return $rootScope.Authentication.get_headers();
        }
    };

    $rootScope.setPage = function(page) {
      $location.path("/");
      $rootScope.page = page;
      $rootScope.Utils.set_title();
    };

    $rootScope.setHomepage = function() {
      $rootScope.setPage("homepage");
      $rootScope.reload();
    };

    $rootScope.closeAlert = function (list, index) {
      list.splice(index, 1);
    };

    $rootScope.open_confidentiality_modal = function () {
      $uibModal.open({
        controller: "ModalCtrl",
        templateUrl: "views/partials/security_awareness_confidentiality.html",
        size: "lg",
        scope: $rootScope
      });
    };

    $rootScope.open_disclaimer_modal = function () {
      $uibModal.open({
        templateUrl: "views/partials/disclaimer.html",
        controller: "DisclaimerModalCtrl",
        size: "lg",
        scope: $rootScope
      });
    };

    $rootScope.evaluateConfidentialityModalOpening = function () {
      if (!$rootScope.connection.tor &&
          !$rootScope.connection.https &&
          !$rootScope.confidentiality_warning_opened &&
          ["localhost", "127.0.0.1"].indexOf($location.host()) === -1) {

        $rootScope.confidentiality_warning_opened = true;
        $rootScope.open_confidentiality_modal();
        return true;
      }

      return false;
    };

    $rootScope.evaluateDisclaimerModalOpening = function () {
      if ($rootScope.public.node.enable_disclaimer &&
          !$rootScope.disclaimer_modal_opened) {
        $rootScope.disclaimer_modal_opened = true;
        $rootScope.open_disclaimer_modal();
        return true;
      }

      return false;
    };

    $rootScope.init = function () {
      return PublicResource.get(function(result, getResponseHeaders) {
        var elem;

        $rootScope.public = result;

        if ($rootScope.public.node.css) {
          elem = document.getElementById("load-custom-css");
          if (elem === null) {
            elem = document.createElement("link");
            elem.setAttribute("id", "load-custom-css");
            elem.setAttribute("rel", "stylesheet");
            elem.setAttribute("type", "text/css");
            elem.setAttribute("href", "s/css");
            document.getElementsByTagName("head")[0].appendChild(elem);
          }
        }

	if ($rootScope.public.node.script) {
          elem = document.getElementById("load-custom-script");
          if (elem === null) {
            elem = document.createElement("script");
            elem.setAttribute("id", "load-custom-script");
            elem.setAttribute("type", "text/javascript");
            elem.setAttribute("src", "s/script");
            document.getElementsByTagName("body")[0].appendChild(elem);
          }
        }

        if ($rootScope.public.node.favicon) {
          elem = document.getElementById("load-favicon");
          if (elem === null) {
            elem = document.createElement("link");
            elem.setAttribute("id", "load-favicon");
            elem.setAttribute("rel", "shortcut icon");
            elem.setAttribute("href", "data:image/png;base64," + $rootScope.public.node.favicon);
            document.getElementsByTagName("head")[0].appendChild(elem);
          } else {
            elem.setAttribute("href", "data:image/png;base64," + $rootScope.public.node.favicon);
          }
        }

        $rootScope.contexts_by_id = $rootScope.Utils.array_to_map(result.contexts);
        $rootScope.receivers_by_id = $rootScope.Utils.array_to_map(result.receivers);
        $rootScope.questionnaires_by_id = $rootScope.Utils.array_to_map(result.questionnaires);

        $rootScope.submission_statuses = result.submission_statuses;

        angular.forEach($rootScope.questionnaires_by_id, function(element, key) {
          $rootScope.fieldUtilities.parseQuestionnaire($rootScope.questionnaires_by_id[key], {});
          $rootScope.questionnaires_by_id[key].steps = $filter("orderBy")($rootScope.questionnaires_by_id[key].steps, "order");
        });

        angular.forEach($rootScope.contexts_by_id, function(element, key) {
          $rootScope.contexts_by_id[key].questionnaire = $rootScope.questionnaires_by_id[$rootScope.contexts_by_id[key].questionnaire_id];
          if ($rootScope.contexts_by_id[key].additional_questionnaire_id) {
            $rootScope.contexts_by_id[key].additional_questionnaire = $rootScope.questionnaires_by_id[$rootScope.contexts_by_id[key].additional_questionnaire_id];
          }
        });

        $rootScope.connection = {
          "https": $location.protocol() === "https",
          "tor": false
        };

        // Tor detection and enforcing of usage of HS if users are using Tor
        if ($location.host().match(/\.onion$/)) {
          // A better check on this situation would be
          // to fetch https://check.torproject.org/api/ip
          $rootScope.connection.tor = true;
        } else if ($rootScope.connection.https) {
          var headers = getResponseHeaders();
          if (headers["X-Check-Tor"] !== undefined && headers["X-Check-Tor"] === "true") {
            $rootScope.connection.tor = true;
            if ($rootScope.public.node.onionservice && !Utils.iframeCheck()) {
              // the check on the iframe is in order to avoid redirects
              // when the application is included inside iframes in order to not
              // mix HTTPS resources with HTTP resources.
              $location.path("http://" + $rootScope.public.node.onionservice + "/#" + $location.url());
            }
          }
        }

        Utils.route_check();

        $rootScope.languages_enabled = {};
        $rootScope.languages_enabled_selector = [];
        $rootScope.languages_supported = {};
        angular.forEach($rootScope.public.node.languages_supported, function(lang) {
          $rootScope.languages_supported[lang.code] = lang;
          if ($rootScope.public.node.languages_enabled.indexOf(lang.code) !== -1) {
            $rootScope.languages_enabled[lang.code] = lang;
            $rootScope.languages_enabled_selector.push(lang);
          }
        });

        if ($rootScope.public.node.enable_experimental_features) {
          $rootScope.isFieldTriggered = fieldUtilities.isFieldTriggered;
        } else {
          $rootScope.isFieldTriggered = $rootScope.dumb_function;
        }

        $rootScope.evaluateConfidentialityModalOpening();

        GLTranslate.addNodeFacts($rootScope.public.node.default_language, $rootScope.public.node.languages_enabled);
        Utils.set_title();

        $rootScope.started = true;

        var observer = new MutationObserver(GLClient.mockEngine.run);

        observer.observe(document.querySelector("body"), { attributes: false, childList: true, subtree: true });
      }).$promise;
    };

    //////////////////////////////////////////////////////////////////

    $rootScope.$watch(function() {
      return $location.path();
    }, function(val) {
      $rootScope.location_path = val;
    });

    $rootScope.$watch(function() {
      return $http.pendingRequests.length;
    }, function(val) {
      $rootScope.showLoadingPanel = val > 0;
    });

    $rootScope.$watch("GLTranslate.state.language", function(new_val, old_val) {
      if(new_val !== old_val) {
        GLTranslate.setLang(new_val);
	$rootScope.reload();
      }
    });

    $rootScope.$on("$routeChangeStart", function() {
      if ($rootScope.public) {
        Utils.route_check();
      }

      var path = $location.path();
      var embedded = "/embedded/";

      if (path.substr(0, embedded.length) === embedded) {
        $rootScope.embedded = true;
        var search = $location.search();
        if (Object.keys(search).length === 0) {
          $location.path(path.replace("/embedded/", "/"));
          $location.search("embedded=true");
        } else {
          $location.url($location.url().replace("/embedded/", "/") + "&embedded=true");
        }
      }
    });

    $rootScope.$on("$routeChangeSuccess", function (event, current) {
      if (current.$$route) {
        $rootScope.successes = [];
        $rootScope.errors = [];
        $rootScope.header_title = current.$$route.header_title;
        $rootScope.sidebar = current.$$route.sidebar;

        if ($rootScope.public) {
          Utils.set_title();
        }
      }
    });

    $rootScope.$on("$routeChangeError", function(event, current, previous, rejection) {
      if (rejection === Access.FORBIDDEN) {
        $rootScope.Authentication.loginRedirect(false);
      }
    });

    $rootScope.$on("REFRESH", function() {
      $rootScope.reload();
    });

    $rootScope.keypress = function(e) {
       if (((e.which || e.keyCode) === 116) || /* F5 */
           ((e.which || e.keyCode) === 82 && (e.ctrlKey || e.metaKey))) {  /* (ctrl or meta) + r */
         e.preventDefault();
         $rootScope.$emit("REFRESH");
       }
    };

    $rootScope.reload = function(new_path) {
      $rootScope.successes = [];
      $rootScope.errors = [];
      $rootScope.init().then(function() {
        $route.reload();

        if (new_path) {
          $location.path(new_path).replace();
        }
      });
    };

    $rootScope.init();
}]).
  factory("globaleaksRequestInterceptor", ["$injector", function($injector) {
    return {
     "request": function(config) {
       var $rootScope = $injector.get("$rootScope");

       angular.extend(config.headers, $rootScope.Authentication.get_headers());

       return config;
     },
     "responseError": function(response) {
       /*/
          When the response has failed write the rootScope
          errors array the error message.
       */
       var $rootScope = $injector.get("$rootScope");
       var $http = $injector.get("$http");
       var $q = $injector.get("$q");
       var $location = $injector.get("$location");

       if (response.status === 405) {
         var errorData = angular.toJson({
             errorUrl: $location.path(),
             errorMessage: response.statusText,
             stackTrace: [{
               "url": response.config.url,
               "method": response.config.method
             }],
             agent: navigator.userAgent
           });
          $http.post("exception", errorData);
       }

       if (response.data !== null) {
         var error = {
           "message": response.data.error_message,
           "code": response.data.error_code,
           "arguments": response.data.arguments
         };

         /* 10: Not Authenticated */
         if (error.code === 10) {
           $rootScope.Authentication.loginRedirect(false);
         } else if (error.code === 4) {
           $rootScope.Authentication.authcoderequired = true;
         } else {
           $rootScope.errors.push(error);
         }
       }

       return $q.reject(response);
     }
   };
}]).
  factory("noopInterpolation", ["$interpolate", "$translateSanitization", function ($interpolate, $translateSanitization) {
  // simple noop interpolation service

  var $locale,
      $identifier = "noop";

  return {
    setLocale: function(locale) {
      $locale = locale;
    },
    getInterpolationIdentifier : function () {
      return $identifier;
    },
    useSanitizeValueStrategy: function (value) {
      $translateSanitization.useStrategy(value);
      return this;
    },
    interpolate: function (value/*, interpolationParams, context, sanitizeStrategy, translationId*/) {
      return value;
    }
  };
}]).
  factory("stacktraceService", function() {
    return({
      fromError: StackTrace.fromError
    });
});
