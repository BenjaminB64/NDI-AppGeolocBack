'use strict';
const Async = require('async');
const Bcrypt = require('bcrypt');
const Boom = require('boom');
const Config = require('../../config');
const Joi = require('joi');


const internals = {};


internals.applyRoutes = function (server, next) {

    const AuthAttempt = server.plugins['hapi-mongo-models'].AuthAttempt;
    const Session = server.plugins['hapi-mongo-models'].Session;
    const User = server.plugins['hapi-mongo-models'].User;


    server.route({
        method: 'POST',
        path: '/login',
        config: {
            validate: {
                payload: {
                    email: Joi.string().email().lowercase().required(),
                    password: Joi.string().required()
                }
            },
            pre: [{
                assign: 'abuseDetected',
                method: function (request, reply) {

                    const ip = request.info.remoteAddress;
                    const email = request.payload.email;

                    AuthAttempt.abuseDetected(ip, email, (err, detected) => {

                        if (err) {
                            return reply(err);
                        }

                        if (detected) {
                            return reply(Boom.badRequest('Maximum number of auth attempts reached. Please try again later.'));
                        }

                        reply();
                    });
                }
            }, {
                assign: 'user',
                method: function (request, reply) {

                    const email = request.payload.email;
                    const password = request.payload.password;

                    User.findByCredentials(email, password, (err, user) => {

                        if (err) {
                            return reply(err);
                        }

                        reply(user);
                    });
                }
            }, {
                assign: 'logAttempt',
                method: function (request, reply) {

                    if (request.pre.user) {
                        return reply();
                    }

                    const ip = request.info.remoteAddress;
                    const email = request.payload.email;

                    AuthAttempt.create(ip, email, (err, authAttempt) => {

                        if (err) {
                            return reply(err);
                        }

                        return reply(Boom.badRequest('Email and password combination not found or account is inactive.'));
                    });
                }
            }, {
                assign: 'session',
                method: function (request, reply) {

                    const userAgent = request.headers['user-agent'];
                    const ip = request.headers['x-forwarded-for'] || request.info.remoteAddress;

                    Session.create(request.pre.user._id.toString(), ip, userAgent, (err, session) => {

                        if (err) {
                            return reply(err);
                        }

                        return reply(session);
                    });
                }
            }]
        },
        handler: function (request, reply) {

            const credentials = request.pre.session._id.toString() + ':' + request.pre.session.key;
            const authHeader = 'Basic ' + new Buffer(credentials).toString('base64');

            reply({
                user: {
                    _id: request.pre.user._id,
                    username: request.pre.user.username,
                    email: request.pre.user.email,
                    roles: request.pre.user.roles
                },
                session: request.pre.session,
                authHeader
            });
        }
    });


    server.route({
        method: 'POST',
        path: '/login/forgot',
        config: {
            validate: {
                payload: {
                    email: Joi.string().email().lowercase().required()
                }
            },
            pre: [{
                assign: 'user',
                method: function (request, reply) {

                    const conditions = {
                        email: request.payload.email
                    };

                    User.findOne(conditions, (err, user) => {

                        if (err) {
                            return reply(err);
                        }

                        if (!user) {
                            return reply({ message: 'Success.' }).takeover();
                        }

                        reply(user);
                    });
                }
            }]
        },
        handler: function (request, reply) {

            const mailer = request.server.plugins.mailer;

            Async.auto({
                keyHash: function (done) {

                    Session.generateKeyHash(done);
                },
                user: ['keyHash', function (results, done) {

                    const id = request.pre.user._id.toString();
                    const update = {
                        $set: {
                            resetPassword: {
                                token: results.keyHash.hash,
                                expires: Date.now() + 10000000
                            }
                        }
                    };

                    User.findByIdAndUpdate(id, update, done);
                }],
                email: ['user', function (results, done) {

                    const emailOptions = {
                        subject: 'Reset your ' + Config.get('/projectName') + ' password',
                        to: request.payload.email
                    };
                    const template = 'forgot-password';
                    const context = {
                        key: results.keyHash.key
                    };

                    mailer.sendEmail(emailOptions, template, context, done);
                }]
            }, (err, results) => {

                if (err) {
                    return reply(err);
                }

                reply({ message: 'Success.' });
            });
        }
    });


    server.route({
        method: 'POST',
        path: '/login/reset',
        config: {
            validate: {
                payload: {
                    key: Joi.string().required(),
                    email: Joi.string().email().lowercase().required(),
                    password: Joi.string().required()
                }
            },
            pre: [{
                assign: 'user',
                method: function (request, reply) {

                    const conditions = {
                        email: request.payload.email,
                        'resetPassword.expires': { $gt: Date.now() }
                    };

                    User.findOne(conditions, (err, user) => {

                        if (err) {
                            return reply(err);
                        }

                        if (!user) {
                            return reply(Boom.badRequest('Invalid email or key.'));
                        }

                        reply(user);
                    });
                }
            }]
        },
        handler: function (request, reply) {

            Async.auto({
                keyMatch: function (done) {

                    const key = request.payload.key;
                    const token = request.pre.user.resetPassword.token;
                    Bcrypt.compare(key, token, done);
                },
                passwordHash: ['keyMatch', function (results, done) {

                    if (!results.keyMatch) {
                        return reply(Boom.badRequest('Invalid email or key.'));
                    }

                    User.generatePasswordHash(request.payload.password, done);
                }],
                user: ['passwordHash', function (results, done) {

                    const id = request.pre.user._id.toString();
                    const update = {
                        $set: {
                            password: results.passwordHash.hash
                        },
                        $unset: {
                            resetPassword: undefined
                        }
                    };

                    User.findByIdAndUpdate(id, update, done);
                }]
            }, (err, results) => {

                if (err) {
                    return reply(err);
                }

                reply({ message: 'Success.' });
            });
        }
    });


    next();
};


exports.register = function (server, options, next) {

    server.dependency(['mailer', 'hapi-mongo-models'], internals.applyRoutes);

    next();
};


exports.register.attributes = {
    name: 'login'
};
