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
 * Forum service.
 *
 * @module mm.addons.mod_hsuforum
 * @ngdoc controller
 * @name $mmaModHsuforum
 */
.factory('$mmaModHsuforum', function($q, $mmSite, $mmUser, $mmGroups, $translate, $mmSitesManager, mmaModHsuforumDiscPerPage,
            mmaModHsuforumComponent, $mmaModHsuforumOffline, $mmApp, $mmUtil) {
    var self = {};

    /**
     * Get cache key for can add discussion WS calls.
     *
     * @param  {Number} forumid Forum ID.
     * @param  {Number} groupid Group ID.
     * @return {String}         Cache key.
     */
    function getCanAddDiscussionCacheKey(forumid, groupid) {
        return getCommonCanAddDiscussionCacheKey(forumid) + ':' + groupid;
    }

    /**
     * Get common part of cache key for can add discussion WS calls.
     *
     * @param  {Number} forumid Forum ID.
     * @return {String}         Cache key.
     */
    function getCommonCanAddDiscussionCacheKey(forumid) {
        return 'mmaModHsuforum:canadddiscussion:' + forumid;
    }

    /**
     * Get cache key for forum data WS calls.
     *
     * @param {Number} courseid Course ID.
     * @return {String}         Cache key.
     */
    function getForumDataCacheKey(courseid) {
        return 'mmaModHsuforum:forum:' + courseid;
    }

    /**
     * Get cache key for forum discussion posts WS calls.
     *
     * @param  {Number} discussionid Discussion ID.
     * @return {String}              Cache key.
     */
    function getDiscussionPostsCacheKey(discussionid) {
        return 'mmaModHsuforum:discussion:' + discussionid;
    }

    /**
     * Get cache key for forum discussions list WS calls.
     *
     * @param  {Number} forumid Forum ID.
     * @return {String}         Cache key.
     */
    function getDiscussionsListCacheKey(forumid) {
        return 'mmaModHsuforum:discussions:' + forumid;
    }

    /**
     * Add a new discussion.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#addNewDiscussion
     * @param {Number} forumId        Forum ID.
     * @param {String} name           Forum name.
     * @param {Number} courseId       Course ID the forum belongs to.
     * @param {String} subject        New discussion's subject.
     * @param {String} message        New discussion's message.
     * @param {String} subscribe      True if should subscribe to the discussion, false otherwise.
     * @param {String} [groupId]      Group this discussion belongs to.
     * @param {String} [siteId]       Site ID. If not defined, current site.
     * @param {Number} [timecreated]  The time the discussion was created. Only used when editing discussion.
     * @return {Promise}              Promise resolved when the discussion is created.
     */
    self.addNewDiscussion = function(forumId, name, courseId, subject, message, subscribe, groupId, siteId, timecreated) {
        siteId = siteId || $mmSite.getId();

        // If we are editing an offline discussion, discard previous first.
        var discardPromise = timecreated ? $mmaModHsuforumOffline.deleteNewDiscussion(forumId, timecreated, siteId) : $q.when();

        return discardPromise.then(function() {
            if (!$mmApp.isOnline()) {
                // App is offline, store the action.
                return storeOffline();
            }

            return self.addNewDiscussionOnline(forumId, subject, message, subscribe, groupId, siteId).then(function() {
                return true;
            }).catch(function(error) {
                if (error && error.wserror) {
                    // The WebService has thrown an error, this means that responses cannot be deleted.
                    return $q.reject(error.error);
                } else {
                    // Couldn't connect to server, store in offline.
                    return storeOffline();
                }
            });
        });

        // Convenience function to store a message to be synchronized later.
        function storeOffline() {
            return $mmaModHsuforumOffline.addNewDiscussion(forumId, name, courseId, subject, message, subscribe, groupId, siteId)
                    .then(function() {
                return false;
            });
        }
    };

    /**
     * Add a new discussion. It will fail if offline or cannot connect.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#addNewDiscussionOnline
     * @param {Number} forumId   Forum ID.
     * @param {String} subject   New discussion's subject.
     * @param {String} message   New discussion's message.
     * @param {String} subscribe True if should subscribe to the discussion, false otherwise.
     * @param {String} [groupId] Group this discussion belongs to.
     * @param {String} [siteId]  Site ID. If not defined, current site.
     * @return {Promise}         Promise resolved when the discussion is created.
     */
    self.addNewDiscussionOnline = function(forumId, subject, message, subscribe, groupId, siteId) {
        siteId = siteId || $mmSite.getId();

        return $mmSitesManager.getSite(siteId).then(function(site) {
            var params = {
                forumid: forumId,
                subject: subject,
                message: message,
                options: [
                    {
                        name: 'discussionsubscribe',
                        value: !!subscribe
                    }
                ]
            };
            if (groupId) {
                params.groupid = groupId;
            }

            return site.write('mod_hsuforum_add_discussion', params).catch(function(error) {
                return $q.reject({
                    error: error,
                    wserror: $mmUtil.isWebServiceError(error)
                });
            }).then(function(response) {
                // Other errors ocurring.
                if (!response || !response.discussionid) {
                    return $q.reject({
                        wserror: true
                    });
                } else {
                    return response.discussionid;
                }
            });
        });
    };

    /**
     * Check if a user can post to a certain group.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#canAddDiscussion
     * @param  {Number} forumid Forum ID.
     * @param  {Number} groupid Group ID.
     * @return {Promise}        Promise resolved with a boolean: true if can add discussion, false otherwise.
     */
    self.canAddDiscussion = function(forumid, groupid) {
        var params = {
                forumid: forumid,
                groupid: groupid
            },
            preSets = {
                cacheKey: getCanAddDiscussionCacheKey(forumid, groupid)
            };

        return $mmSite.read('mod_hsuforum_can_add_discussion', params, preSets).then(function(result) {
            if (result) {
                return !!result.status;
            }
            return $q.reject();
        });
    };

    /**
     * Check if a user can post to all groups.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#canAddDiscussionToAll
     * @param  {Number} forumid Forum ID.
     * @return {Promise}        Promise resolved with a boolean: true if can add discussion to all, false otherwise.
     */
    self.canAddDiscussionToAll = function(forumid) {
        return self.canAddDiscussion(forumid, -1);
    };

    /**
     * Extract the starting post of a discussion from a list of posts. The post is removed from the array passed as a parameter.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#getStartingPost
     * @param  {Object[]} posts Posts to search.
     * @return {Object}         Starting post.
     */
    self.extractStartingPost = function(posts) {
        // Check the last post first, since they'll usually be ordered by create time.
        for (var i = posts.length - 1; i >= 0; i--) {
            if (posts[i].parent == 0) {
                return posts.splice(i, 1).pop(); // Remove it from the array.
            }
        }

        return undefined;
    };

    /**
     * Check if canAddDiscussion is available.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#isCanAddDiscussionAvailable
     * @return {Boolean} True if available, false otherwise.
     */
    self.isCanAddDiscussionAvailable = function() {
        return $mmSite.wsAvailable('mod_hsuforum_can_add_discussion');
    };

    /**
     * Return whether or not the plugin is enabled in a certain site. Plugin is enabled if the forum WS are available.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#isPluginEnabled
     * @param  {String} [siteId] Site ID. If not defined, current site.
     * @return {Promise}         Promise resolved with true if plugin is enabled, rejected or resolved with false otherwise.
     */
    self.isPluginEnabled = function(siteId) {
        siteId = siteId || $mmSite.getId();

        return $mmSitesManager.getSite(siteId).then(function(site) {
            return  site.wsAvailable('mod_hsuforum_get_forums_by_courses') &&
                    site.wsAvailable('mod_hsuforum_get_forum_discussions_paginated') &&
                    site.wsAvailable('mod_hsuforum_get_forum_discussion_posts');
        });
    };

    /**
     * Format discussions, setting groupname if the discussion group is valid.
     *
     * @param  {Number} cmid          Forum cmid.
     * @param  {Object[]} discussions List of discussions to format.
     * @return {Promise}              Promise resolved with the formatted discussions.
     */
    self.formatDiscussionsGroups = function(cmid, discussions) {
        discussions = angular.copy(discussions);
        return $translate('mm.core.allparticipants').then(function(strAllParts) {
            return $mmGroups.getActivityAllowedGroups(cmid).then(function(forumgroups) {
                // Turn groups into an object where each group is identified by id.
                var groups = {};
                angular.forEach(forumgroups, function(fg) {
                    groups[fg.id] = fg;
                });

                // Format discussions.
                angular.forEach(discussions, function(disc) {
                    if (disc.groupid === -1) {
                        disc.groupname = strAllParts;
                    } else {
                        var group = groups[disc.groupid];
                        if (group) {
                            disc.groupname = group.name;
                        }
                    }
                });
                return discussions;
            });
        }).catch(function() {
            return discussions;
        });
    };

    /**
     * Get a forum by course module ID.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#getForum
     * @param {Number} courseId Course ID.
     * @param {Number} cmId     Course module ID.
     * @param {String} [siteId] Site ID. If not defined, current site.
     * @return {Promise}        Promise resolved when the forum is retrieved.
     */
    self.getForum = function(courseId, cmId, siteId) {
        siteId = siteId || $mmSite.getId();
        return $mmSitesManager.getSite(siteId).then(function(site) {
            var params = {
                    courseids: [courseId]
                },
                preSets = {
                    cacheKey: getForumDataCacheKey(courseId)
                };

            return site.read('mod_hsuforum_get_forums_by_courses', params, preSets).then(function(forums) {
                for (var x in forums) {
                    if (forums[x].cmid == cmId) {
                        return forums[x];
                    }
                }
                return $q.reject();
            });
        });
    };

    /**
     * Get forum discussion posts.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#getDiscussionPosts
     * @param {Number} discussionid Discussion ID.
     * @return {Promise}            Promise resolved with forum discussions.
     */
    self.getDiscussionPosts = function(discussionid) {
        var params = {
                discussionid: discussionid
            },
            preSets = {
                cacheKey: getDiscussionPostsCacheKey(discussionid)
            };

        return $mmSite.read('mod_hsuforum_get_forum_discussion_posts', params, preSets).then(function(response) {
            if (response) {
                storeUserData(response.posts);
                return response.posts;
            } else {
                return $q.reject();
            }
        });
    };

    /**
     * Sort forum discussion posts by an specified field.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#sortDiscussionPosts
     * @param  {Array}  posts     Discussion posts to be sorted.
     * @param  {String} direction Direction of the sorting (ASC / DESC).
     * @return {Array}            Discussion posts sorted.
     */
    self.sortDiscussionPosts = function(posts, direction) {
        // @todo: Check children when sorting.
        return posts.sort(function (a, b) {
            a = parseInt(a.created, 10);
            b = parseInt(b.created, 10);
            if (direction == 'ASC') {
                return a >= b ? 1 : -1;
            } else {
                return a <= b ? 1 : -1;
            }
        });
    };

    /**
     * Get forum discussions.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#getDiscussions
     * @param {Number}  forumId     Forum ID.
     * @param {Number}  page        Page.
     * @param {Boolean} forceCache  True to always get the value from cache, false otherwise.
     * @param {String}  [siteId]    Site ID. If not defined, current site.
     * @return {Promise}            Promise resolved with forum discussions.
     */
    self.getDiscussions = function(forumId, page, forceCache, siteId) {
        siteId = siteId || $mmSite.getId();
        return $mmSitesManager.getSite(siteId).then(function(site) {
            page = page || 0;

            var params = {
                    forumid: forumId,
                    sortby:  'timemodified',
                    sortdirection:  'DESC',
                    page: page,
                    perpage: mmaModHsuforumDiscPerPage
                },
                preSets = {
                    cacheKey: getDiscussionsListCacheKey(forumId)
                };

            if (forceCache) {
                preSets.omitExpires = true;
            }

            return site.read('mod_hsuforum_get_forum_discussions_paginated', params, preSets).then(function(response) {
                if (response) {
                    var canLoadMore = response.discussions.length >= mmaModHsuforumDiscPerPage;
                    storeUserData(response.discussions);
                    return {discussions: response.discussions, canLoadMore: canLoadMore};
                } else {
                    return $q.reject();
                }
            });
        });
    };

    /**
     * Get forum discussions in several pages.
     * If a page fails, the discussions until that page will be returned along with a flag indicating an error occurred.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#getDiscussionsInPages
     * @param  {Number}  forumId     Forum ID.
     * @param  {Boolean} forceCache  True to always get the value from cache, false otherwise.
     * @param  {Number}  [numPages]  Number of pages to get. If not defined, all pages.
     * @param  {Number}  [startPage] Page to start. If not defined, first page.
     * @param  {String}  [siteId]    Site ID. If not defined, current site.
     * @return {Promise}             Promise resolved with an object with:
     *                                 - discussions: List of discussions.
     *                                 - error: True if an error occurred, false otherwise.
     */
    self.getDiscussionsInPages = function(forumId, forceCache, numPages, startPage, siteId) {
        if (typeof numPages == 'undefined') {
            numPages = -1;
        }

        startPage = startPage || 0;
        numPages = parseInt(numPages, 10);

        var result = {
            discussions: [],
            error: false
        };

        if (!numPages) {
            return result;
        }

        return getPage(startPage);

        function getPage(page) {
            // Get page discussions.
            return self.getDiscussions(forumId, page, forceCache, siteId).then(function(response) {
                result.discussions = result.discussions.concat(response.discussions);
                numPages--;

                if (response.canLoadMore && numPages !== 0) {
                    return getPage(page + 1); // Get next page.
                } else {
                    return result;
                }
            }).catch(function() {
                // Error getting a page.
                result.error = true;
                return result;
            });
        }
    };

    /**
     * Invalidates can add discussion WS calls.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#invalidateCanAddDiscussion
     * @param  {Number} forumId   Forum ID.
     * @param  {String} [siteId]  Site ID. If not defined, current site.
     * @return {Promise}          Promise resolved when the data is invalidated.
     */
    self.invalidateCanAddDiscussion = function(forumId, siteId) {
        siteId = siteId || $mmSite.getId();

        return $mmSitesManager.getSite(siteId).then(function(site) {
            return site.invalidateWsCacheForKeyStartingWith(getCommonCanAddDiscussionCacheKey(forumId));
        });
    };

    /**
     * Invalidate the prefetched content except files.
     * To invalidate files, use $mmaModHsuforum#invalidateFiles.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#invalidateContent
     * @param {Number} moduleId The module ID.
     * @param {Number} courseId Course ID.
     * @return {Promise}        Promise resolved when data is invalidated.
     */
    self.invalidateContent = function(moduleId, courseId) {
        // Get the forum first, we need the forum ID.
        return self.getForum(courseId, moduleId).then(function(forum) {
            // We need to get the list of discussions to be able to invalidate their posts.
            return self.getDiscussionsInPages(forum.id, true).then(function(response) {
                // Now invalidate the WS calls.
                var promises = [];

                promises.push(self.invalidateForumData(courseId));
                promises.push(self.invalidateDiscussionsList(forum.id));
                promises.push(self.invalidateCanAddDiscussion(forum.id));

                angular.forEach(response.discussions, function(discussion) {
                    promises.push(self.invalidateDiscussionPosts(discussion.discussion));
                });

                return $q.all(promises);
            });
        });
    };

    /**
     * Invalidates forum discussion posts.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#invalidateDiscussionPosts
     * @param {Number} discussionId Discussion ID.
     * @param {String} [siteId]     Site ID. If not defined, current site.
     * @return {Promise}            Promise resolved when the data is invalidated.
     */
    self.invalidateDiscussionPosts = function(discussionId, siteId) {
        siteId = siteId || $mmSite.getId();

        return $mmSitesManager.getSite(siteId).then(function(site) {
            return site.invalidateWsCacheForKey(getDiscussionPostsCacheKey(discussionId));
        });
    };

    /**
     * Invalidates discussion list.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#invalidateDiscussionsList
     * @param  {Number} forumId  Forum ID.
     * @param  {String} [siteId] Site ID. If not defined, current site.
     * @return {Promise}         Promise resolved when the data is invalidated.
     */
    self.invalidateDiscussionsList = function(forumId, siteId) {
        siteId = siteId || $mmSite.getId();

        return $mmSitesManager.getSite(siteId).then(function(site) {
            return site.invalidateWsCacheForKey(getDiscussionsListCacheKey(forumId));
        });
    };

    /**
     * Invalidate the prefetched files.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#invalidateFiles
     * @param {Number} moduleId The module ID.
     * @return {Promise}        Promise resolved when the files are invalidated.
     */
    self.invalidateFiles = function(moduleId) {
        return $mmFilepool.invalidateFilesByComponent($mmSite.getId(), mmaModHsuforumComponent, moduleId);
    };

    /**
     * Invalidates forum data.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#invalidateForumData
     * @param {Number} courseid Course ID.
     * @return {Promise}        Promise resolved when the data is invalidated.
     */
    self.invalidateForumData = function(courseid) {
        return $mmSite.invalidateWsCacheForKey(getForumDataCacheKey(courseid));
    };

    /**
     * Check if the current site allows creating new discussions.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#isCreateDiscussionEnabled
     * @return {Boolean} True if enabled, false otherwise.
     */
    self.isCreateDiscussionEnabled = function() {
        return $mmSite.wsAvailable('core_group_get_activity_groupmode') &&
                $mmSite.wsAvailable('core_group_get_activity_allowed_groups') &&
                $mmSite.wsAvailable('mod_hsuforum_add_discussion');
    };

    /**
     * Check if the current site allows replying to posts.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#isReplyPostEnabled
     * @return {Boolean} True if enabled, false otherwise.
     */
    self.isReplyPostEnabled = function() {
        return $mmSite.wsAvailable('mod_hsuforum_add_discussion_post');
    };

    /**
     * Report a forum as being viewed.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#logView
     * @param {String} id Module ID.
     * @return {Promise}  Promise resolved when the WS call is successful.
     */
    self.logView = function(id) {
        if (id) {
            var params = {
                forumid: id
            };
            return $mmSite.write('mod_hsuforum_view_forum', params);
        }
        return $q.reject();
    };

    /**
     * Reply to a certain post.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#replyPost
     * @param {Number} postId           ID of the post being replied.
     * @param {Number} discussionId     ID of the discussion the user is replying to.
     * @param {Number} forumId          ID of the forum the user is replying to.
     * @param {String} name             Forum name.
     * @param {Number} courseId         Course ID the forum belongs to.
     * @param {String} subject          New post's subject.
     * @param {String} message          New post's message.
     * @param {String} [siteId]         Site ID. If not defined, current site.
     * @return {Promise}                Promise resolved when the post is created.
     */
    self.replyPost = function(postId, discussionId, forumId, name, courseId, subject, message, siteId) {
        siteId = siteId || $mmSite.getId();

        if (!$mmApp.isOnline()) {
            // App is offline, store the action.
            return storeOffline();
        }

        // If there's already a reply to be sent to the server, discard it first.
        return $mmaModHsuforumOffline.deleteReply(postId, siteId).then(function() {
            return self.replyPostOnline(postId, subject, message, siteId).then(function() {
                return true;
            }).catch(function(error) {
                if (error && error.wserror) {
                    // The WebService has thrown an error, this means that responses cannot be deleted.
                    return $q.reject(error.error);
                } else {
                    // Couldn't connect to server, store in offline.
                    return storeOffline();
                }
            });
        });

        // Convenience function to store a message to be synchronized later.
        function storeOffline() {
            return $mmaModHsuforumOffline.replyPost(postId, discussionId, forumId, name, courseId, subject, message, siteId)
                    .then(function() {
                return false;
            });
        }
    };

    /**
     * Reply to a certain post. It will fail if offline or cannot connect.
     *
     * @module mm.addons.mod_hsuforum
     * @ngdoc method
     * @name $mmaModHsuforum#replyPostOnline
     * @param {Number} postId   ID of the post being replied.
     * @param {String} subject  New post's subject.
     * @param {String} message  New post's message.
     * @param {String} [siteId] Site ID. If not defined, current site.
     * @return {Promise}        Promise resolved when the post is created.
     */
    self.replyPostOnline = function(postId, subject, message, siteId) {
        siteId = siteId || $mmSite.getId();

        return $mmSitesManager.getSite(siteId).then(function(site) {
            var params = {
                postid: postId,
                subject: subject,
                message: message
            };

            return site.write('mod_hsuforum_add_discussion_post', params).catch(function(error) {
                return $q.reject({
                    error: error,
                    wserror: $mmUtil.isWebServiceError(error)
                });
            }).then(function(response) {
                if (!response || !response.postid) {
                    return $q.reject({
                        wserror: true
                    });
                } else {
                    return response.postid;
                }
            });
        });
    };

    /**
     * Store the users data from a discussions/posts list.
     *
     * @param {Object[]} list Array of posts or discussions.
     */
    function storeUserData(list) {
        var ids = [];
        angular.forEach(list, function(entry) {
            var id = parseInt(entry.userid);
            if (!isNaN(id) && ids.indexOf(id) === -1) {
                ids.push(id);
                $mmUser.storeUser(id, entry.userfullname, entry.userpictureurl);
            }
            if (typeof entry.usermodified != 'undefined') {
                id = parseInt(entry.usermodified);
                if(!isNaN(id) && ids.indexOf(id) === -1) {
                    ids.push(id);
                    $mmUser.storeUser(id, entry.usermodifiedfullname, entry.usermodifiedpictureurl);
                }
            }
        });
    }

    return self;
});