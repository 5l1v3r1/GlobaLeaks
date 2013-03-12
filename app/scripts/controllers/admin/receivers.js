GLClient.controller('AdminReceiversCtrl', ['$scope',
function($scope) {

  $scope.new_receiver = {};

  $scope.add_receiver = function() {
    var receiver = new $scope.admin.receiver;

    receiver.name = $scope.new_receiver.name;
    receiver.password = $scope.new_receiver.password;
    receiver.notification_fields = {'mail_address': $scope.new_receiver.email};

    // receiver.languages = [];
    // receiver.tags = [];

    // Under here go default settings
    receiver.contexts =  [];
    receiver.description = '';
    receiver.can_delete_submission = true;
    receiver.receiver_level = 1;
    receiver.$save(function(added_receiver){
      $scope.admin.receivers.push(added_receiver);
      $scope.new_receiver = {};
    });

  };

  $scope.delete = function(receiver) {
    var idx = _.indexOf($scope.admin.receivers, receiver);

    receiver.$delete(function(){
      $scope.admin.receivers.splice(idx, 1);
    });

  };
}]);

GLClient.controller('AdminReceiversEditorCtrl', ['$scope',
  function($scope) {
    $scope.editing = false;

    $scope.toggleEditing = function() {
      $scope.editing = $scope.editing ^ 1;
    }

    // Used to keep track of weather or not the profile file has been changed
    // or not.
    $scope.fileSelected = false;
    $scope.changeProfile = function() {
      $scope.fileSelected = true;
    }

    $scope.closeProfile = function() {
      $scope.fileSelected = false;
      $scope.uploadfile = false;
    }
}]);
