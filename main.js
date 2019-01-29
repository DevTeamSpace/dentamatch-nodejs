/* 
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

/* global __dirname */

var config      =   require('./config');
var express     =   require('express');
var app         =   express();
var httpsserver      =   require('https');//.Server(app);
var fs          =   require('fs');
var options = {
    key: fs.readFileSync('/etc/ssl/private/dentamatch19.key','utf8'),
    cert: fs.readFileSync('/etc/ssl/certs/dentamatch-bundle19.crt','utf8')
};

var server = httpsserver.createServer(options,app);//.listen(8443);

var socketio    =   require('socket.io')(server,{ origins: '*:*', pingInterval:2000});//,pingTimeout:4000
var mysql       =   require("mysql");
var MySQLCM     =   require('mysql-connection-manager');
//var fs          =   require('fs');
var request     =   require('request');
        
app.get('/',function(req,res){
	res.end('Chat server is running at 3000 port');
});


var options = {
    host: config.databaseHost,// Host name for database connection.
    port: config.databasePort,// Port number for database connection.
    user: config.databaseUser,// Database user.
    password: config.databasePassword,// Password for the above database user.
    database: config.database,// Database name.
    autoReconnect: true,// Whether or not to re-establish a database connection after a disconnect.
    reconnectDelay: [
        500,// Time between each attempt in the first group of reconnection attempts; milliseconds.
        1000,// Time between each attempt in the second group of reconnection attempts; milliseconds.
        5000,// Time between each attempt in the third group of reconnection attempts; milliseconds.
        30000,// Time between each attempt in the fourth group of reconnection attempts; milliseconds.
        300000// Time between each attempt in the fifth group of reconnection attempts; milliseconds.
    ],
    charset : 'utf8mb4',
    useConnectionPooling: false,// Whether or not to use connection pooling.
    reconnectDelayGroupSize: 5,// Number of reconnection attempts per reconnect delay value.
    maxReconnectAttempts: 25,// Maximum number of reconnection attempts. Set to 0 for unlimited.
    keepAlive: true,// Whether or not to send keep-alive pings on the database connection(s).
    keepAliveInterval: 30000// How frequently keep-alive pings will be sent; milliseconds.
};


var con = mysql.createConnection(options);

var manager = new MySQLCM(options, con);

var onlineUsers     =   [];  	//array for online users [their socket connection is active]
var socketByUser    =   [];		//array to find socket information by userid
var userBySocket    =   [];		//array to find user by their socket id
var userInfo        =   {};		//array to find userinfo, app will get info for first time for any user and keep it till their socket is active
var userGroups      =   [];		//array to find user groups. 

var dateLocal     =   new Date(); 
        console.log(dateLocal);
        var dateRes  = Date.parse(dateLocal) / 1000;
        console.log(dateRes);
        dateRes = dateRes-(3600*24);
        var formatted = new Date(dateRes*1000);
        var arrKey = formatted.getFullYear() + pad(formatted.getMonth()+1) + pad(formatted.getDate());
        console.log(arrKey);

function pad(n) {
         return (n < 10) ? '0' + n : n;
    }
con.connect(function(err){
  if(err){
    console.log('Error connecting to Db');
console.log(err);
    return;
  }
  console.log('Database connection established');
});
socketio.on('connection', function (socket) {
    //console.log(socket);
    socket.on('init', function (data, callback) {
        console.log(data);
        //if user information is not available in array then fetch it from db and add to userinfo array
//        if(!userInfo[data.userId]){
            var objUser     =   {
                        "userType": data.userType, // 1=>seeker, 2=>recruiter
                        "userName": data.userName,
                        "userId" : data.userId,
                        "with" : null,
			"blockedUser" : []
                    };
            userInfo[data.userId]   =   objUser;
            console.log(userInfo);
	if(socketByUser[data.userId] && socket.id!=socketByUser[data.userId].id){
                console.log('previous session logout calling '+data.userId);
		socketByUser[data.userId].emit('logoutPreviousSession',{logout:true});
            }    
        socketByUser[data.userId]   =   socket;
            userBySocket[socket.id]     =   data.userId;
        var query = "select seeker_id as blockedUser from chat_user_list where recruiter_id = ? and (seeker_block = 1 or recruiter_block = 1) ";
        if(data.userType==1){
            query = "select recruiter_id as blockedUser from chat_user_list where seeker_id = ? and (seeker_block = 1 or recruiter_block = 1) ";    
        }
        con.query(query,[data.userId],function(err, rows){
            rows.forEach(function(row, index) {
                userInfo[data.userId].blockedUser.push(parseInt(row.blockedUser,10));
            });
        });
  //      }
        //user user info to different array    
        if(onlineUsers.indexOf(parseInt(data.userId,10))== -1)
            onlineUsers.push(parseInt(data.userId,10));
        console.log(data);
        callback({status:1});
    });

    function getListObj(msgObj, callback){
        con.query('select count(id) as msgCount from user_chat where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)',[msgObj.fromId,msgObj.toId,msgObj.toId,msgObj.fromId],function(err, rows){
            if(err) throw err;
            console.log(rows);
            if(rows[0].msgCount==1){
                getChatUserListObj(msgObj, function (result) {
                    console.log('result');
                    console.log(result);
                    callback(result);
                });
            }else{
                callback(msgObj);
            }
        });
    }

    function getChatUserListObj(msgObj, callback){console.log(msgObj);
        var query = 'select rp.office_name as name, cul.recruiter_id as recruiterId, ';
                query += 'cul.id as messageListId, cul.seeker_id as seekerId, ';
                query += 'cul.recruiter_block as recruiterBlock, cul.seeker_block as seekerBlock, ';
                query += 'uc.id AS messageId, uc.created_at AS timestamp, uc.message as message '
                query += 'from chat_user_list as cul ';
                query += 'join user_chat as uc on (uc.from_id = cul.recruiter_id and uc.to_id = cul.seeker_id) or (uc.from_id = cul.seeker_id and uc.to_id = cul.recruiter_id)';
                query += 'join recruiter_profiles as rp on rp.user_id=cul.recruiter_id ';
                query += 'where  cul.recruiter_id = ? and cul.seeker_id = ? ';
                console.log(query);
                con.query(query,[msgObj.fromId,msgObj.toId,msgObj.toId,msgObj.fromId],function(err, rowUcl){
                    if(err) throw err;
                    console.log(rowUcl);console.log(msgObj);
		    rowUcl[0].messageId = msgObj.messageId;
                    rowUcl[0].timestamp = msgObj.sentTime;
                    rowUcl[0].message = msgObj.message;
                    //rowUcl.messageDelivered = 1;
                    callback(rowUcl[0]);
                });
    }
    
    //trigger this event for sending message
    socket.on('sendMessage',function(data, callback){
        //conver time to UTC
        var dateLocal     =   new Date(); 
        console.log(dateLocal);
        var dateRes  = Date.parse(dateLocal);
        console.log(dateRes);
        var readStatus = 1;
        if(!userInfo[data.toId] || userInfo[data.toId]['with']==null || userInfo[data.toId]['with']!=data.fromId)
            readStatus=0;
 console.log(userInfo[data.fromId]);
	var index = -1;
	if(userInfo[data.toId]){
		index = userInfo[data.toId].blockedUser.indexOf(parseInt(data.fromId,10));
	} 
        if(index!=-1){
            callback({blocked:true});
        }else{
	//save message to DB
        con.query('INSERT INTO user_chat (from_id, to_id, message, read_status) values(?,?,?,?)',[data.fromId, data.toId, data.message, readStatus],function(err, rows){
            if(err) throw err;
            var msgObj = {
                            fromId : parseInt(data.fromId,10),
                            toId : parseInt(data.toId,10), 
                            fromName : userInfo[data.fromId].userName,
                            message : data.message, 
                            //messageDelivered : 1, 
                            sentTime : dateRes,
                            messageId : parseInt(rows.insertId,10)
                        };
    	   if(data.messageFrom){
                console.log('data');
                getListObj(msgObj,function(newMsgObj){
                    console.log('callback');
                    msgObj = newMsgObj;
                    console.log(newMsgObj);
                    console.log(msgObj);
                    console.log('msgObj');
			callback(newMsgObj);
		emitMessage(data,msgObj);
                });
            }else{
                callback(msgObj);
		emitMessage(data,msgObj);
            }        
   	console.log(msgObj); 
        });
        }
    });
	function emitMessage(data,msgObj){
		if(socketByUser[data.toId]){
                console.log('msgObj');
                socketByUser[data.toId].emit('receiveMessage',msgObj);
            }else{
                //msgObj.messageDelivered = 0;
                if(userInfo[data.fromId]['userType']==2){
                    offlinePushNotification(msgObj);
                }
            }
	}

    function offlinePushNotification(msgObj){
        request.post({url:config.apiHost+'chat/send-message', form: msgObj }, function(err,httpResponse,body){
            //console.log(httpResponse);
            console.log(err);
            console.log(body);
        });
    }

    //trigger this event to update chat with attribute of userInfo
    socket.on('notOnChat',function(data,callback){
        if(userInfo[data.fromId])
            userInfo[data.fromId]['with'] = null;
        callback({status:1});
    });

    //trigger this event to block/unblock messgae to seeker
    //socket.on('blockUnblock',function(data){
      //  con.query('update chat_user_list set recruiter_block = ? where recruiter_id = ? AND seeker_id = ?',[data.blockStatus,data.fromId,data.toId],function(err,rows){
        //    if(err) throw err;                  
        //});
   // });
    socket.on('blockUnblock',function(data,callback){
        var query = 'update chat_user_list set recruiter_block = ? where recruiter_id = ? AND seeker_id = ?';
	if(userInfo[data.fromId].userType==1){
            query = 'update chat_user_list set seeker_block = ? where seeker_id = ? AND recruiter_id = ?';
        }console.log(query);
        if(data.blockStatus==1){
            userInfo[data.fromId].blockedUser.push(parseInt(data.toId,10));
        }else{
            var index = userInfo[data.fromId].blockedUser.indexOf(parseInt(data.toId,10));
            userInfo[data.fromId].blockedUser.splice(index, 1);
        }
        con.query(query,[data.blockStatus,data.fromId,data.toId],function(err,rows){
            if(err) throw err;        
		callback({status:1});          		                      
        });
	//callback({status:1});
    });


    //trigger this event to update read messages between users
    socket.on('updateReadCount',function(data,callback){
        if(userInfo[data.toId])
            userInfo[data.toId]['with'] = data.fromId;
        con.query('update user_chat set read_status = "1" where from_id = ? AND to_id = ?',[data.fromId,data.toId],function(err,rows){
            if(err) throw err;
            callback({ status : 1, recruiterId : data.fromId });                  
        });
    });

    //trigger this event to update read message status for a message
    socket.on('updateMessageReadStatus',function(data){
        userInfo[data.fromId]['with'] = data.toId;
        con.query('update user_chat set read_status = "1" where id = ?',[data.messageId],function(err,rows){
            if(err) throw err;                  
        });
    });

    //trigger this event to get unread messages count between users
    socket.on('unreadCount',function(data, callback){
        console.log('unreadCount');
        con.query('select count(id) as unreadCount, from_id as fromId from user_chat where to_id = ? and read_status="0" group by from_id ',[data.fromId],function(err, rows){
            if(err) throw err;
            callback(rows);
        });
    });

    //trigger this event to get user complete messages history 
    socket.on('getChatHistory',function(data,callback){
        //find message history information from DB
        con.query('select id as messageId, from_id as fromId, to_id as toId, message, created_at as sentTime from user_chat where from_id = ? or to_id = ? order by id desc',[data.fromId, data.fromId],function(err, rows){
            if(err) throw err;
            var result = rows.reverse();
            for (var i = 0; i < result.length; i++) {
                result[i].sentTime =   Date.parse(result[i].sentTime);
            }
            callback(result);
        });
    });

    //trigger this event to get user complete messages history 
    socket.on('getLeftMessages',function(data,callback){
        //find message history information from DB
        con.query('select id as messageId, from_id as fromId, to_id as toId, message, created_at as sentTime from user_chat where id > ? and ((from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)) order by id desc',[data.messageId, data.fromId, data.toId, data.toId, data.fromId],function(err, rows){
            if(err) throw err;
            var result = rows.reverse();
            for (var i = 0; i < result.length; i++) {
                result[i].sentTime =   Date.parse(result[i].sentTime);
            }
            callback(result);
        });
    });

    //trigger this event to get message history for a user
    socket.on('getHistory',function(data){
        var page = data.pageNo;
        var limit = 50;
        if(!page){
            page = 1;
        }
        var start = (page-1)*50;
        console.log(page);
        console.log(start);
        var source = (data.source==undefined)?0:1;
        var resultArr = {};
        //find message history information from DB
        con.query('select id as messageId, from_id as fromId, to_id as toId, message, created_at as sentTime from user_chat where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?) order by id desc',[data.fromId, data.toId, data.toId, data.fromId],function(err, rows){
            if(err) throw err;
            var result = rows.reverse();
            for (var i = 0; i < result.length; i++) {
                result[i].sentTime =   Date.parse(result[i].sentTime);
                if(source==1){
                    var formatted = new Date(result[i].sentTime);
                    var arrKey = formatted.getFullYear()+'_'+ (formatted.getMonth())+'_'+ pad(formatted.getDate());
                    
                    if(!resultArr[arrKey]){
                        resultArr[arrKey] = [result[i]];
                    }else{
                        var length = resultArr[arrKey].length;
                        resultArr[arrKey][length] = result[i];
                    }
                }

            }
            socketByUser[data.fromId].emit('getMessages',(source==1)?resultArr:result);
            //socketByUser[data.fromId].emit('getMessages',rows.reverse());
        });
    });
    
    
    //automatically/manually triggered when user socket connection is disconnected. And clear all information related to this socket
    socket.on('disconnect', function()  {
        var user    =   userBySocket[socket.id];
        if(socketByUser[user] && socket.id==socketByUser[user].id){
	console.log(user); console.log('disconnect');
        if(typeof(userInfo[user])!= 'undefined')
            var userName    =   userInfo[user].userName;
        else
            var userName    =   '';
        console.log(user+" : "+ userName+" is Disconnected.");
        var index   =   onlineUsers.indexOf(parseInt(user,10));
        onlineUsers.splice(index, 1);
        delete userBySocket[socket.id];
        delete socketByUser[user];
        delete userInfo[user];
        console.log(userInfo);
//        console.log(socketByUser);
  //      console.log(userBySocket);
	}
    });
});

server.listen(config.port, function () {console.log(config.port);
    console.log('Example app listening on port 3000!');
});
