// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.addons.mod_hsuforum')

/**
 * Forum discussion controller.
 *
 * @module mm.addons.mod_hsuforum
 * @ngdoc controller
 * @name mmaModHsuforumDiscussionCtrl
 */
.controller('mmaModHsuforumDiscussionCtrl', function($q, $scope, $stateParams, $mmaModHsuforum, $mmSite, $mmUtil, $translate, $mmEvents,
            $ionicScrollDelegate, mmaModHsuforumComponent, mmaModHsuforumReplyDiscussionEvent, $mmaModHsuforumOffline, $mmaModHsuforumSync,
            mmaModHsuforumAutomSyncedEvent, mmaModHsuforumManualSyncedEvent, $mmApp, $ionicPlatform, mmCoreEventOnlineStatusChanged) {

    var discussionId = $stateParams.discussionid,
        courseid = $stateParams.cid,
        forumId = $stateParams.forumid,
        cmid = $stateParams.cmid,
        scrollView,
        syncObserver, syncManualObserver, onlineObserver;

    $scope.discussionId = discussionId;
    $scope.component = mmaModHsuforumComponent;
    $scope.discussionStr = $translate.instant('discussion');
    $scope.componentId = cmid;
    $scope.courseid = courseid;
    $scope.refreshPostsIcon = 'spinner';
    $scope.syncIcon = 'spinner';
    $scope.newpost = {
        replyingto: undefined,
        editing: undefined,
        subject: '',
        text: '',
        isEditing: false
    };
    $scope.sort = {
        icon: 'ion-arrow-up-c',
        direction: 'ASC',
        text: $translate.instant('mma.mod_hsuforum.sortnewestfirst')
    };

    // Convenience function to get forum discussions.
    function fetchPosts(sync, showErrors) {
        var syncPromise,
            onlinePosts = [],
            offlineReplies = [];

        $scope.isOnline = $mmApp.isOnline();
        $scope.isTablet = $ionicPlatform.isTablet();
        if (sync) {
            // Try to synchronize the forum.
            syncPromise = syncDiscussion(showErrors).catch(function() {
                // Ignore errors.
            });
        } else {
            syncPromise = $q.when();
        }

        return syncPromise.then(function() {
            return $mmaModHsuforum.getDiscussionPosts(discussionId).then(function(posts) {
                onlinePosts = posts;

            }).finally(function() {
                // Check if there are responses stored in offline.
                return $mmaModHsuforumOffline.hasDiscussionReplies(discussionId).then(function(hasOffline) {
                    $scope.postHasOffline = hasOffline;

                    if (hasOffline) {
                        return $mmaModHsuforumOffline.getDiscussionReplies(discussionId).then(function(replies) {
                            var convertPromises = [];

                            // Index posts to allow quick access.
                            var posts = {};
                            angular.forEach(onlinePosts, function(post) {
                                posts[post.id] = post;
                            });

                            angular.forEach(replies, function(offlineReply) {
                                convertPromises.push($mmaModHsuforumOffline.convertOfflineReplyToOnline(offlineReply)
                                        .then(function(reply) {
                                    offlineReplies.push(reply);

                                    // Disable reply of the parent. Reply in offline to the same post is not allowed, edit instead.
                                    posts[reply.parent].canreply = false;
                                }));
                            });

                            return $q.all(convertPromises).then(function() {
                                // Convert back to array.
                                onlinePosts = Object.keys(posts).map(function (key) {return posts[key];});
                            });
                        });
                    }
                });
            });
        }).finally(function() {
            var posts = offlineReplies.concat(onlinePosts);
            $scope.discussion = $mmaModHsuforum.extractStartingPost(posts);
            // Set default reply subject.
            $scope.posts = $mmaModHsuforum.sortDiscussionPosts(posts, $scope.sort.direction);

            return $translate('mma.mod_hsuforum.re').then(function(strReplyPrefix) {
                $scope.defaultSubject = strReplyPrefix + ' ' + $scope.discussion.subject;
                $scope.newpost.subject = $scope.defaultSubject;
            });
        }).catch(function(message) {
            $mmUtil.showErrorModal(message);
            return $q.reject();
        }).finally(function() {
            $scope.discussionLoaded = true;
            $scope.refreshPostsIcon = 'ion-refresh';
            $scope.syncIcon = 'ion-loop';
        });
    }

    // Function to change posts sorting.
    $scope.changeSort = function(init) {
        $scope.discussionLoaded = false;

        if (!init) {
            $scope.sort.direction = $scope.sort.direction == 'ASC' ? 'DESC' : 'ASC';
        }

        return fetchPosts(init).then(function() {
            if ($scope.sort.direction == 'ASC') {
                $scope.sort.icon = 'ion-arrow-up-c';
                $scope.sort.text = $translate.instant('mma.mod_hsuforum.sortnewestfirst');
            } else {
                $scope.sort.icon = 'ion-arrow-down-c';
                $scope.sort.text = $translate.instant('mma.mod_hsuforum.sortoldestfirst');
            }
        });
    };

    // Tries to synchronize the posts discussion.
    function syncDiscussion(showErrors) {
        return $mmaModHsuforumSync.syncDiscussionReplies(discussionId).then(function(result) {
            if (result.warnings && result.warnings.length) {
                $mmUtil.showErrorModal(result.warnings[0]);
            }

            if (result && result.updated) {
                // Sync successful, send event.
                $mmEvents.trigger(mmaModHsuforumManualSyncedEvent, {
                    siteid: $mmSite.getId(),
                    forumid: forumId,
                    userid: $mmSite.getUserId(),
                    warnings: result.warnings
                });
            }

            return result.updated;
        }).catch(function(error) {
            if (showErrors) {
                if (error) {
                    $mmUtil.showErrorModal(error);
                } else {
                    $mmUtil.showErrorModal('mm.core.errorsync', true);
                }
            }
            return $q.reject();
        });
    }

    // Refresh posts.
    function refreshPosts(sync, showErrors) {
        scrollTop();
        $scope.refreshPostsIcon = 'spinner';
        $scope.syncIcon = 'spinner';
        return $mmaModHsuforum.invalidateDiscussionPosts(discussionId).finally(function() {
            return fetchPosts(sync, showErrors);
        });
    }

    // Trigger an event to notify a new reply.
    function notifyPostListChanged() {
        var data = {
            forumid: forumId,
            discussionid: discussionId,
            cmid: cmid
        };
        $mmEvents.trigger(mmaModHsuforumReplyDiscussionEvent, data);
    }

    $scope.changeSort(true).then(function() {
        // Add log in Moodle.
        $mmSite.write('mod_hsuforum_view_forum_discussion', {
            discussionid: discussionId
        });
    });

    // Pull to refresh.
    $scope.refreshPosts = function(showErrors) {
        if ($scope.discussionLoaded) {
            return refreshPosts(true, showErrors).finally(function() {
                $scope.$broadcast('scroll.refreshComplete');
            });
        }
    };

    // Refresh data if this forum discussion is synchronized automatically.
    syncObserver = $mmEvents.on(mmaModHsuforumAutomSyncedEvent, function(data) {
        if (data && data.siteid == $mmSite.getId() && data.forumid == forumId && data.userid == $mmSite.getUserId() &&
                discussionId == data.discussionid) {
            // Refresh the data.
            $scope.discussionLoaded = false;
            refreshPosts(false);
        }
    });

    // Refresh online status when changes.
    onlineObserver = $mmEvents.on(mmCoreEventOnlineStatusChanged, function(online) {
        $scope.isOnline = online;
    });

    // Refresh data if this forum discussion is synchronized from discussions list.
    syncManualObserver = $mmEvents.on(mmaModHsuforumManualSyncedEvent, function(data) {
        if (data && data.siteid == $mmSite.getId() && data.forumid == forumId && data.userid == $mmSite.getUserId()) {
            // Refresh the data.
            $scope.discussionLoaded = false;
            refreshPosts(false);
        }
    });


    function scrollTop() {
        if (!scrollView) {
            scrollView = $ionicScrollDelegate.$getByHandle('mmaModHsuforumPostsScroll');
        }
        scrollView && scrollView.scrollTop && scrollView.scrollTop();
    }

    // New post added.
    $scope.postListChanged = function() {
        $scope.newpost.replyingto = undefined;
        $scope.newpost.editing = undefined;
        $scope.newpost.subject = $scope.defaultSubject;
        $scope.newpost.text = '';
        $scope.newpost.isEditing = false;

        notifyPostListChanged();

        $scope.discussionLoaded = false;
        refreshPosts(false).finally(function() {
            $scope.discussionLoaded = true;
        });
    };

    $scope.$on('$destroy', function(){
        syncObserver && syncObserver.off && syncObserver.off();
        syncManualObserver && syncManualObserver.off && syncManualObserver.off();
        onlineObserver && onlineObserver.off && onlineObserver.off();
    });
});
