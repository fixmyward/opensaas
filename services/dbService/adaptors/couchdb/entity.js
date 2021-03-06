var uuid = require('node-uuid');
var http = require('http');
var path = require('path');
var fs = require('fs');
var mmmMagic = require('mmmagic'); //   Used to detect mime-type by data inspection

// next is always called with the arguments
// next(err, obj)
module.exports = function(conn, settings) {
    return {
        create: function(application, collection, entity, object, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    var viewName = '_design/' + nsBuilder([collection, entity], 2);
                    db.save(viewName, {
                        views: {
                            all: {
                                map: "function(doc) {if(doc.view == '" + viewName + "'){emit(doc);}}"
                            }
                        }
                    });
                    object.view = viewName;
                    db.save(object, function(err, res) {
                        if (err) {
                            logger.error("error creating. db.save error:");
                            logger.error(err);
                            logger.info("Object:");
                            logger.info(object);
                        } else {
                            object.id = res.id;
                        }

                        next(err, object);
                    });
                }
            });
        },

        findById: function(application, collection, entity, id, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    logger.info("Searching for id: " + id);
                    db.get(id, function(err, res) {
                        if (!err && res != null) {
                            delete res.view;
                        }
                        next(err, res);
                    });
                }
            });
        },
        findAll: function(application, collection, entity, queryString, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    var viewName = nsBuilder([collection, entity], 2) + "/all";
                    logger.info("Searching for view: " + viewName);
                    db.view(viewName, function(err, res) {
                        if (res == null || err) {
                            res = [];
                        } else {
                            for (var i = 0; i < res.length; i++) {
                                res[i] = res[i].key;
                                delete res[i].view;
                            }
                        }
                        next(err, res || []);
                    });
                }
            });
        },

        update: function(application, collection, entity, id, object, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    if (object == null) {
                        logger.error("Object was null.");
                        next(exceptions.entity.updateException("Object cannot be null."), object);
                    } else {
                        var _id = id;
                        delete object._attachments;
                        delete object._id;
                        db.merge(_id, object, function(err, res) {
                            object._id = _id;
                            if (err) {
                                console.log(err.error);
                                logger.error("Error updating.");
                                logger.error(err);
                                next(exceptions.entity.updateException(res), object);
                            } else {
                                next(null, object); //XXX should return whole obj? efficiency of that?
                            }
                        });
                    }
                }
            });
        },

        findAttachment: function(application, collection, entity, id, name, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    db.get(id, function(err, res) {
                        if (!err && res != null) {
                            var id = res._id
                            var rev = res._rev
                            var readStream = db.getAttachment(id, name, function(err) { // note no second reply paramter
                                if (err) {
                                    logger.error(err);
                                    next(err);
                                    return;
                                }
                                logger.info('Attachment piped to user.');
                            })
                            next(null, readStream);
                        } else {
                            logger.error(err);
                        }
                    });
                }
            });
        },

        removeAttachment: function(application, collection, entity, id, name, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    db.get(id, function(err, res) {
                        if (!err && res != null) {
                            db.removeAttachment(id, name, function(err, res) {
                                if (err) {
                                    logger.error(err);
                                } else {
                                    logger.info('Attachment deleted.');
                                }
                                next(err, res);
                            });
                        } else {
                            logger.error(err);
                        }
                    });
                }
            });
        },

        attachFile: function(application, collection, entity, id, name, file, mimeType, next) {
            logger.info("Attaching file: " + application + "/" + entity + "/" + id + "/attachments/" + name);
            //  Check to make sure the user actually sent a file.
            if (file != null) {
                //  Set the database to the appropriate application (eg. NoteBook).
                var db = getDb(conn, application, function(err, db) {
                    //  There was an error getting the database.
                    if (err) {
                        logger.error("getDB error:");
                        logger.error(err);
                        next(err);
                    } else {
                        function getLatestDoc(retry) {
                            //  Get more info about the document with the given id.
                            db.get(id, function(err, res) {
                                //  Check if there was error getting the document.
                                if (!err && res != null) {
                                    //  Get the latest revision number from this result
                                    var rev = res._rev;
                                    //  We need to send the id data to cradle "save attachment" request
                                    var idData = {
                                        id: id,
                                        rev: rev
                                    };
                                    //  We need to send info about the document to cradle
                                    var attachmentData = {
                                        name: name,
                                        "Content-Type": mimeType
                                    };
                                    //  db.saveAttachment returns a writable stream
                                    var writeStream = db.saveAttachment(idData, attachmentData, function(err2, res2) {
                                        console.log(err2);
                                        next()
                                    });
                                    //  Pipe the output of the readStream to the writable stream
                                    file.pipe(writeStream);
                                } else {
                                    logger.error(err);
                                }
                            });
                        }
                        getLatestDoc(0);
                    }
                });
            } else {
                next("No attachment specified", null);
                logger.error("No attachment given.");
            }
        },

        del: function(application, collection, entity, id, next) {
            var db = getDb(conn, application, function(err, db) {
                if (err) {
                    logger.error("getDB error:");
                    logger.error(err);
                    next(err);
                } else {
                    if (!id) {
                        var viewName = nsBuilder([collection, entity], 2) + "/all";
                        logger.info("Searching for view: " + viewName);
                        db.view(viewName, function(err, res) {
                            if (res == null || err) {
                                next(err, res);
                            } else {
                                var nextDelete = function(x) {
                                    if (x >= res.length) {
                                        next(err, res);
                                    } else {
                                        db.remove(res[x].id, function(err, res) {
                                            logger.info(res);
                                            nextDelete(x + 1);
                                        });
                                    }
                                }
                                nextDelete(0);
                            }

                        });
                    } else {
                        db.remove(id, function(err, res) {
                            next(err, res);
                        });
                    }
                }
            });
        }
    };
};

function getDb(conn, dbNameStr, next) {
    var db = conn.database(dbNameStr);
    db.exists(function(err, exists) {
        if (err) { //TODO log this
            logger.error('couch error: ', err);
            next(err, null);
        } else if (!exists) {
            logger.info("Creating new database: " + dbNameStr);
            db.create(function(err, obj) {
                next(err, db);
            });
        } else {
            next(err, db);
        }
    });
}

function nsBuilder(namespaceElements, numElements) {
    var ns = [].slice.call(namespaceElements);
    if (numElements) ns = ns.slice(0, numElements);
    return ns.join(':');
}