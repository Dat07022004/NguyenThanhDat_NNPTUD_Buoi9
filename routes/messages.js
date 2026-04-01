let express = require('express');
let router = express.Router();
let mongoose = require('mongoose');
let multer = require('multer');
let path = require('path');

let messageModel = require('../schemas/messages');
let userModel = require('../schemas/users');
let { CheckLogin } = require('../utils/authHandler');

let storageSetting = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        let ext = path.extname(file.originalname);
        let filename = Date.now() + '-' + Math.round(Math.random() * 1000_000_000) + ext;
        cb(null, filename);
    }
});

let uploadFile = multer({
    storage: storageSetting,
    limits: 10 * 1024 * 1024
});

router.get('/', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;

        let lastMessages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        {
                            from: currentUserId
                        },
                        {
                            to: currentUserId
                        }
                    ]
                }
            },
            {
                $addFields: {
                    partnerId: {
                        $cond: [{ $eq: ['$from', currentUserId] }, '$to', '$from']
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $group: {
                    _id: '$partnerId',
                    lastMessage: {
                        $first: '$$ROOT'
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'partner'
                }
            },
            {
                $unwind: {
                    path: '$partner',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $sort: {
                    'lastMessage.createdAt': -1
                }
            }
        ]);

        res.send(lastMessages);
    } catch (error) {
        res.status(400).send({
            message: error.message
        });
    }
});

router.get('/:userID', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let userID = req.params.userID;

        if (!mongoose.Types.ObjectId.isValid(userID)) {
            return res.status(400).send({
                message: 'userID khong hop le'
            });
        }

        let messages = await messageModel.find({
            $or: [
                {
                    from: currentUserId,
                    to: userID
                },
                {
                    from: userID,
                    to: currentUserId
                }
            ]
        }).sort({ createdAt: 1 });

        res.send(messages);
    } catch (error) {
        res.status(400).send({
            message: error.message
        });
    }
});

router.post('/:userID', CheckLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let userID = req.params.userID;

        if (!mongoose.Types.ObjectId.isValid(userID)) {
            return res.status(400).send({
                message: 'userID khong hop le'
            });
        }

        let receiver = await userModel.findOne({
            _id: userID,
            isDeleted: false
        });

        if (!receiver) {
            return res.status(404).send({
                message: 'khong tim thay user nhan'
            });
        }

        let messageContent = null;
        if (req.file) {
            messageContent = {
                type: 'file',
                text: req.file.path
            };
        } else {
            let text = String(req.body.text || '').trim();
            if (!text) {
                return res.status(400).send({
                    message: 'text khong duoc de trong khi gui tin nhan text'
                });
            }
            messageContent = {
                type: 'text',
                text: text
            };
        }

        let newMessage = new messageModel({
            from: currentUserId,
            to: userID,
            messageContent: messageContent
        });

        await newMessage.save();

        res.send(newMessage);
    } catch (error) {
        res.status(400).send({
            message: error.message
        });
    }
});

module.exports = router;