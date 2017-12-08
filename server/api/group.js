'use strict';
const AuthPlugin = require('../auth');
const Async = require('async');
const Boom = require('boom');
const Joi = require('joi');


const internals = {};


internals.applyRoutes = function (server, next) {

    const User = server.plugins['hapi-mongo-models'].User;
    const Account = server.plugins['hapi-mongo-models'].Account;
    const Admin = server.plugins['hapi-mongo-models'].Admin;
    const Group = server.plugins['hapi-mongo-models'].Group;


    server.route({
        method: 'GET',
        path: '/groups',
        config: {
            auth: {
                strategy: 'simple',
                scope: ['admin', 'account']
            },
            validate: {
                query: {
                    id: Joi.number(),
                }
            },
        },
        handler: function (request, reply) {
            if (request.params.id) {
                return Group.findOne({ _id: request.payload.id }, (res, err) => {
                    if (err) {
                        reply(err);
                    }
                    else reply(res);
                });
            }
            else {
                return Group.find((res, err) => {
                    if (err) {
                        reply(err);
                    }
                    else reply(res);
                    console.log(res);
                });
            }
        }
    });
    server.route({
        method: 'PUT',
        path: '/group',
        config: {
            auth: {
                strategy: 'simple',
                scope: ['admin', 'account']
            },
            validate: {
                query: {
                    name: Joi.string().required(),
                }
            },
            pre: [
                AuthPlugin.preware.ensureNotRoot,
                {
                    assign: 'groupnameCheck',
                    method: function (request, reply) {

                        const conditions = {
                            name: request.payload.name
                        };

                         Group.findOne(conditions, (err, user) => {

                            if (err) {
                                return reply(err);
                            }

                            if (user) {
                                return reply(Boom.conflict('Group name already in use.'));
                            }

                            reply(true);
                        });
                    }
                }
            ]
        },
        handler: function (request, reply) {
             Async.auto({
                group: function (done) {
                    Group.insertOne(request.payload, done)
                },
                account: ['group', function (result, done) {
                    User.updateOne({ _id: this.account._id })
                }]
            }, (err, results) => {

                if (err) {
                    return reply(err);
                }

                reply(results.user);
            });
        }
    });
    next();
};


exports.register = function (server, options, next) {

    server.dependency('auth', internals.applyRoutes);

    next();
};


exports.register.attributes = {
    name: 'group'
};
