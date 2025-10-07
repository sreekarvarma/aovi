const mongoose = require('mongoose');
const router = require('express').Router();
const express = require('express');
const sanitizeHtml = require('sanitize-html');
// Define the Mongoose schema
const commentSchema = new mongoose.Schema({
    text: { type: String, required: true },
    author: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    data: { type: Object },
    room: { type: String },
    usersAgree: { type: Array },
    usersDisagree: { type: Array },
    usersNeutral: { type: Array },
});

// Create the Mongoose model
const Comment = mongoose.model('Comment', commentSchema);

publicCommentData = function(comment, recipientUserId){
    // turn comment into editable object
    comment = comment.toObject();
    console.log('agree', comment.usersAgree);
    console.log('disagree', comment.usersDisagree);
    console.log('neutral', comment.usersNeutral);
    console.log('recipientUserId', recipientUserId);
    const userId = recipientUserId.toString();
    // convert usersAgree, usersDisagree, usersNeutral to strings
    const usersAgree = comment.usersAgree.map(user => user.toString());
    const usersDisagree = comment.usersDisagree.map(user => user.toString());
    const usersNeutral = comment.usersNeutral.map(user => user.toString());
   
    const myReaction = usersAgree.includes(userId) ? "agree" : usersDisagree.includes(userId) ? "disagree" : usersNeutral.includes(userId) ? "neutral" : "none";
    console.log('myReaction', myReaction);

    // userCategories: data ? data.userCategories ? data.userCategories : {} : {}

    const data = comment.data || {};
    const pc =  {
        _id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
        author: comment.author===recipientUserId ? "me" : "others",
        room: comment.room,
        usersAgree: comment.usersAgree.length,
        usersDisagree: comment.usersDisagree.length,
        usersNeutral: comment.usersNeutral.length,
        myReaction: myReaction,
        data: data
    };
    console.log('publicComment', pc);
    return pc;
}

function commentService(io) {
// static files from client folder
router.use('/static', express.static('./services/comments/client'));

// expect json
router.use(express.json());

// Create a new comment
router.post('/', async (req, res) => {
    console.log('req.body PRESAN', req.body);
    // sanitize text
    const sanitizeOptions = {
        allowedTags: [],
        allowedAttributes: [],
        disallowedTagsMode: 'escape'
    };
    
    if (req.body.text) {
        req.body.text = sanitizeHtml(req.body.text.toString(), sanitizeOptions);
    }
    if (req.body.room) {
        req.body.room = sanitizeHtml(req.body.room.toString(), sanitizeOptions);
    }
    if (req.body.user && req.body.user.id) {
        req.body.user.id = sanitizeHtml(req.body.user.id.toString(), sanitizeOptions);
    }

    const data = req.body.data || {};
    
    // check if same user sent same text in the last 5 seconds
    const lastComment = await Comment.findOne({ text: req.body.text, author: req.body.user.id, createdAt: { $gt: new Date(Date.now() - 5000) } });
    if (lastComment) {
        console.log('lastComment', lastComment);
        return res.status(400).send({ message: 'You cannot send the same comment twice in 5 seconds' });
    }

    try {
        const commentData = {
            text: req.body.text,
            author: req.body.user.id,
            room: req.body.room,
            data: data
        }
        const comment = new Comment(commentData);
        await comment.save();
        
        // emit to all other clients
        const publicComment = publicCommentData(comment, req.body.user.id);
        console.log('publicComment', publicComment);
        io.to(comment.room).emit('comment created', publicComment);
        res.status(201).send(publicComment);
        
    } catch (error) {
        console.log(error);
        res.status(400).send(error);
    }
});

// Read all comments
router.get('/', async (req, res) => {
    console.log('get all comments');
    try {
        const comments = await Comment.find();
        const publicComments = comments.map(comment => publicCommentData(comment, req.body.user.id));
        res.status(200).send(publicComments);
    } catch (error) {
        res.status(500).send(error);
    }
});


router.get('/raw', async (req, res) => {
    if (!req.body.user || !req.body.user.role || !req.body.user.role.includes('superadmin')) {
        return res.status(403).send({ message: 'Forbidden' });
    }
    try {
        const comments = await Comment.find();
        res.status(200).send(comments);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Read comments by multiple rooms (for an event)
router.get('/event/:rooms', async (req, res) => {
    console.log('get comments by event rooms', req.params.rooms);
    try {
        const roomIds = req.params.rooms.split(',');
        const comments = await Comment.find({ room: { $in: roomIds } });
        
        if (!comments.length) {
            return res.status(200).send([]);
        }
        
        const exportComments = comments.map(comment => {
            const c = comment.toObject();
            return {
                text: c.text,
                createdAt: c.createdAt,
                room: c.room,
                author: c.author,
                agrees: c.usersAgree ? c.usersAgree.length : 0,
                disagrees: c.usersDisagree ? c.usersDisagree.length : 0,
                neutrals: c.usersNeutral ? c.usersNeutral.length : 0,
                data: c.data ? JSON.stringify(c.data) : ''
            };
        });
        
        res.status(200).send(exportComments);
    } catch (error) {
        console.log('Error fetching event comments:', error);
        res.status(500).send(error);
    }
});

// Read comments by room name
router.get('/room/:id', async (req, res) => {
    console.log('get comments by room', req.params.id);
    try {
        const comments = await Comment.find({ room: req.params.id });
        if (!comments.length) {
            return res.status(200).send([]);
        }
        const publicComments = comments.map(comment => publicCommentData(comment, req.body.user.id));
        res.status(200).send(publicComments);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Read a single comment by ID
router.get('/:id', async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);
        
        if (!comment) {
            return res.status(404).send();
        }
        
        const publicComment = publicCommentData(comment, req.body.user.id);
        res.status(200).send(publicComment);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Upvote a comment by ID
router.post('/reaction/:id', async (req, res) => {
    // possible reactions: agree, disagree, neutral
    const reaction = req.body.reaction;
    if (!['agree', 'disagree', 'neutral'].includes(reaction)) {
        return res.status(400).send({ message: 'Invalid reaction' });
    }
    
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).send();
        }
        
        const requestUserId = req.body.user.id.toString();
        comment.usersAgree = comment.usersAgree.filter(user => user.toString() !== requestUserId);
        comment.usersDisagree = comment.usersDisagree.filter(user => user.toString() !== requestUserId);
        comment.usersNeutral = comment.usersNeutral.filter(user => user.toString() !== requestUserId);
        
        if (reaction === 'agree') {
            comment.usersAgree.push(req.body.user.id);
        } else if (reaction === 'disagree') {
            comment.usersDisagree.push(req.body.user.id);
        } else if (reaction === 'neutral') {
            comment.usersNeutral.push(req.body.user.id);
        }
        
        // make unique
        comment.usersAgree = [...new Set(comment.usersAgree)];
        comment.usersDisagree = [...new Set(comment.usersDisagree)];
        comment.usersNeutral = [...new Set(comment.usersNeutral)];
        
        await comment.save();
        
        // emit to all other clients
        const publicComment = publicCommentData(comment, req.body.user.id);
        io.to(publicComment.room).emit('comment reacted', publicComment);
        res.status(200).send(publicComment);
    } catch (error) {
        res.status(500).send(error);
    }
});




return router;
}

// Export the service
module.exports = { router: commentService, Comment };
