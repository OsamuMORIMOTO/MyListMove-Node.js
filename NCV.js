var http = require('http');
var https= require('https');
var querystring = require('querystring');
var net = require('net');
var util = require('util');
var fs = require('fs');

var HOST = '';
var PORT = 0;
var thread = '';

// login request
var options = {
    hostname: 'secure.nicovideo.jp',
    port: 443,
    path: '/secure/login?site=niconico',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
//        'Content-Length': Buffer.byteLength(form)
    }
};

var options2 = {
    hostname: 'live.nicovideo.jp',
    port: 80,
    path: '/api/getplayerstatus/',
    method: 'GET',
    headers:{
        'Cookie': ''
    }
};

var options3 = {
    hostname: 'ext.nicovideo.jp',
    port: 80,
    path: '/api/getthumbinfo/',
    method: 'GET',
    headers:{
        //'Cookie': ''
    }
};


// read yamlFile
var text = fs.readFileSync('./conf.yml','utf8');
text = text.replace(/\n/g,',');
text = text.replace(/\s/g,'');
var yamlArr = text.split(',');
var yamlDataJson = {};
yamlArr.forEach(function(yamlData){
  var yamlSp = yamlData.split(':');
  yamlDataJson[yamlSp[0]] = yamlSp[1];
});
console.log(yamlDataJson);

var form = querystring.stringify({
    'mail': yamlDataJson['mail'],
    'password': yamlDataJson['password']
//    'auth_id': '893137709'
});

var lvName = process.argv[2];

var flg = false;
if (process.argv.length > 3){
  flg = true;
}

var p1 = new Promise(
  function(resolve, reject){

    console.log('step1');

    var req = https.request(options, function(res) {
      console.log('get response');
      console.log(res.statusCode);

      var cookieArr = res.headers['set-cookie'];
      for(var i = 0; i < cookieArr.length; i++){
        if(cookieArr[i].match(/^user_session=user_session/)){
          options2.headers['Cookie']=cookieArr[i].slice(0,cookieArr[i].indexOf(';')+1);
        }
      }

      options2.path += lvName;
      resolve();

    }).on('error', function(e) {
      console.log('error!!!')
      console.log(e);
      reject();
    });
    console.log('post request');
    req.write(form);
    req.end();
});

console.log('----debug line----');

var p2 = new Promise(function(resolve,reject){
  p1.then(function(){

    console.log('step2');

    var req2 = http.request(options2, function(res2) {
      console.log('get2');
      console.log(res2.statusCode);

      var body = '';
      res2.on('data', function(data){
        body += data;
      });

      res2.on('end', function(){
        console.log(body);
        console.log(body.slice(body.indexOf('<addr>')+6,body.indexOf('</addr>')));
        console.log(body.slice(body.indexOf('<port>')+6,body.indexOf('</port>')));
        console.log(body.slice(body.indexOf('<thread>')+8,body.indexOf('</thread>')));
        HOST = body.slice(body.indexOf('<addr>')+6,body.indexOf('</addr>'));
        PORT = body.slice(body.indexOf('<port>')+6,body.indexOf('</port>'));
        thread = body.slice(body.indexOf('<thread>')+8,body.indexOf('</thread>'));
        resolve();
      });

    }).on('error', function(e){
      console.log('error2');
      console.log(e);
      reject();
    });
    req2.end();
  }).catch(function(){
    console.log('catch error');
  });
});

Promise.all([p1,p2]).then(function(value){

  console.log('step3');

  var client = new net.Socket();
  client.connect(PORT, HOST, function() {
    console.log('CONNECTED TO: ' + HOST + ':' + PORT);
    var sendTag = util.format('<thread res_from="-1000" version="20061206" scores="1" thread="%s" />\0',thread);
    console.log('sendTag:' + sendTag);
    client.write(sendTag);
  });

  var dataStock = '';
  var tmpChat = '';
  var chatArr = [];
  var handleName = {4737425:"盛本修"};

  fs.writeFile('fullLog', 'start\n', function(err){console.log(err);});
  fs.writeFile('chatLog', 'start\n', function(err){console.log(err);});
  fs.writeFile('videoIdLog', 'start\n', function(err){console.log(err);});

  client.on('data', function(data) {
    //console.log('' + data);
    dataStock += data;
    fs.appendFile('fulllog', data, function(err){console.log(err)});
    while(dataStock.search(/\/>/) > 0 || dataStock.search(/<\/chat>/) > 0){
      dataStock = dataStock.slice(dataStock.search(/\/>/)+2);
      //console.log(dataStock.slice(0, dataStock.search(/<\/chat>/)+7));
      tmpChat = dataStock.slice(0, dataStock.search(/<\/chat>/)+7);
      //console.log(tmpChat);
    
      chatArr.push({
        "no":tmpChat.match(/no=\"(.+?)\"/)[1],
        "chat":tmpChat.match(/<chat.+?>(.+?)<\/chat>/)[1],
        "user_id":tmpChat.match(/user_id=\"(.+?)\"/)[1],
      });

      var chatIdx = chatArr.length -1;
      var username = (chatArr[chatIdx].user_id in handleName) ? handleName[chatArr[chatIdx].user_id] : "184";

      if (chatArr[chatIdx]["chat"].search(/http/) > 0 || flg) {
        console.log(username + ":" + chatArr[chatIdx]["chat"]);
        fs.appendFile('chatlog', username + ":" + chatArr[chatIdx]["chat"] + '\n','utf8',function(err){
            //console.log(err);
        });

        // get movie info
        var videoId = chatArr[chatIdx]["chat"];

        console.log("permcheck:" + videoId.search(/\/perm/));

        if (videoId.search(/\/perm/) < 0 && videoId.search(/www.nicovideo.jp\/watch\//) > 0) {
            videoId = videoId.match(/\/watch\/(sm.+[0-9]?)/)[1];
            console.log(videoId);
        }

        if (videoId != null && videoId.match(/^sm(.+[0-9]?)$/) != null) {
        console.log("request video:" + videoId);
        options3.path = '/api/getthumbinfo/' + videoId;
        options3.headers['Cookie']=options2.headers['Cookie'];
    
        var req = http.request(options3, function(res) {
            console.log('get response');
            //console.log(res.statusCode);
            if (res.statusCode == 200){
                console.log('res');
                res.on('data', function(data){
                    var body = '' + data;
                    console.log(body);
                    console.log(body.slice(body.indexOf('<video_id>')+6,body.indexOf('</video_id>')));

                });
            }  
        }).on('error', function(e) {
            console.log('get thumb info error!!!');
            //console.log(e);
        });
        console.log('post request');
        req.end();
        client.destroy();

        }

      }
      dataStock = dataStock.slice(dataStock.search(/<\/chat>/)+7);
    }
    // Close the client socket completely
    //client.destroy();
  });

  client.on('close', function() {
    console.log('Connection closed');
  });
}, function(value){
  console.log('all error');
});

