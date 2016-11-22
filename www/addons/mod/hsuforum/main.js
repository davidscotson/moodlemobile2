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

angular.module('mm.addons.mod_hsuforum', [])

.constant('mmaModHsuforumDiscPerPage', 10) // Max of discussions per page.
.constant('mmaModHsuforumComponent', 'mmaModHsuforum')
.constant('mmaModHsuforumNewDiscussionEvent', 'mma-mod_hsuforum_new_discussion')
.constant('mmaModHsuforumReplyDiscussionEvent', 'mma-mod_hsuforum_reply_discussion')
.constant('mmaModHsuforumAutomSyncedEvent', 'mma-mod_hsuforum_autom_synced')
.constant('mmaModHsuforumManualSyncedEvent', 'mma-mod_hsuforum_manual_synced')
.constant('mmaModHsuforumSyncTime', 300000) // In milliseconds.

.config(function($stateProvider) {

    $stateProvider

    .state('site.mod_hsuforum', {
        url: '/mod_hsuforum',
        params: {
            module: null,
            courseid: null
        },
        views: {
            'site': {
                controller: 'mmaModHsuforumDiscussionsCtrl',
                templateUrl: 'addons/mod/hsuforum/templates/discussions.html'
            }
        }
    })

    .state('site.mod_hsuforum-discussion', {
        url: '/mod_hsuforum-discussion',
        params: {
            discussionid: null,
            cid: null, // Not naming it courseid because it collides with 'site.mod_hsuforum' param in split-view.
            forumid: null,
            cmid: null
        },
        views: {
            'site': {
                controller: 'mmaModHsuforumDiscussionCtrl',
                templateUrl: 'addons/mod/hsuforum/templates/discussion.html'
            }
        }
    })

    .state('site.mod_hsuforum-newdiscussion', {
        url: '/mod_hsuforum-newdiscussion',
        params: {
            cid: null, // Not naming it courseid because it collides with 'site.mod_hsuforum' param in split-view.
            forumid: null,
            cmid: null,
            timecreated: null
        },
        views: {
            'site': {
                controller: 'mmaModHsuforumNewDiscussionCtrl',
                templateUrl: 'addons/mod/hsuforum/templates/newdiscussion.html'
            }
        }
    });

})

.config(function($mmCourseDelegateProvider, $mmContentLinksDelegateProvider, $mmCoursePrefetchDelegateProvider) {
    $mmCourseDelegateProvider.registerContentHandler('mmaModHsuforum', 'hsuforum', '$mmaModHsuforumHandlers.courseContent');
    $mmContentLinksDelegateProvider.registerLinkHandler('mmaModHsuforum', '$mmaModHsuforumHandlers.linksHandler');
    $mmCoursePrefetchDelegateProvider.registerPrefetchHandler('mmaModHsuforum', 'hsuforum', '$mmaModHsuforumPrefetchHandler');
})
.run(function($mmCronDelegate) {
    $mmCronDelegate.register('mmaModHsuforum', '$mmaModHsuforumHandlers.syncHandler');
});
