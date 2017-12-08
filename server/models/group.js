'use strict';
const Joi = require('joi');
const MongoModels = require('mongo-models');

class Group extends MongoModels {

}
Group.collection = 'groups';


Group.schema = Joi.object({
    _id: Joi.object(),
    isActive: Joi.boolean().default(true),
    name: Joi.string().token().lowercase().required(),
    timeCreated: Joi.date()
});

Group.indexes = [
    { key: { name: 1 }, unique: true },
];


module.exports = Group;
