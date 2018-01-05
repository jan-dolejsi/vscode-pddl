/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import uuidv4 = require('uuid/v4');
import express = require('express');
import request = require('request');
import bodyParser = require('body-parser')
import opn = require('opn');

export class Authentication {
    constructor(private authUrl: string, private authRequestEncoded: string, private clientId: string, 
        private tokensvcUrl: string, private tokensvcApiKey: string, private tokensvcAccessPath: string, 
        private tokensvcValidatePath: string, private tokensvcCodePath: string, private tokensvcRefreshPath: string, private tokensvcSvctkPath: string,
        public refreshToken: string, public accessToken: string, public sToken: string) {
        this.display();
    }

    display() {
        console.log(this.authUrl);
        console.log(this.authRequestEncoded);
        console.log(this.clientId);
        console.log(this.tokensvcUrl);
        console.log(this.tokensvcApiKey);
        console.log(this.tokensvcAccessPath);
        console.log(this.tokensvcValidatePath);
        console.log(this.tokensvcCodePath);
        console.log(this.tokensvcRefreshPath);
        console.log(this.tokensvcSvctkPath);
        console.log(this.refreshToken);
        console.log(this.accessToken);
        console.log(this.sToken);
    }

    login(callback: (refreshToken: string, accessToken: string, sToken: string) => void) {
        var nonce = uuidv4();
        var app = express()
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        var server:any = null;
        var thisAuthentication = this;
        app.post('/auth/sauth/callback', function (req:any, res:any, next:any) {
            server.close();
            if(req.body.nonce == nonce) {
                thisAuthentication.refreshToken = req.body.refreshtoken;
                thisAuthentication.accessToken = req.body.accesstoken;
                thisAuthentication.sToken = req.body.stoken;
                callback(thisAuthentication.refreshToken, thisAuthentication.accessToken, thisAuthentication.sToken)
                res.sendStatus(200);
                next();
            }
            else {
                console.log('Unexpected nonce: ' + req.body.nonce + '(expected:' + nonce + ')');
                res.sendStatus(401);
                next();
            }
        })
        server = app.listen(8081)

        let authUrl = this.authUrl + '?authRequest=' + this.authRequestEncoded + '&nonce=' + nonce + '&refreshtoken&accesstoken&stoken';
        opn(authUrl);
    }

    updateTokens(callback: (refreshToken: string, accessToken: string, sToken: string) => void) {
        if(this.sToken == null || this.sToken == "") {
            if(this.accessToken == null || this.accessToken == "") {
                if(this.refreshToken == null || this.refreshToken == "") {
                    this.refreshToken = null;
                    this.accessToken = null;
                    this.sToken = null;
                }
                else {
                    this.accessToken = null;
                    this.sToken = null;
                    this.refreshAccessAndSToken(callback);
                }
            }
            else {
                this.sToken = null;
                this.refreshSToken(callback);
            }
        }
        else {
            this.validateSToken(callback);
        }
    }

    refreshAccessAndSToken(callback: (refreshToken: string, accessToken: string, sToken: string) => void) {
        let authentication = this;
        request.post({ url: this.tokensvcUrl + this.tokensvcRefreshPath + '?key=' + this.tokensvcApiKey + '&accesstoken=\'\'', json: {clientid: this.clientId, refreshtoken: this.refreshToken}}, 
        function(error, response, body) {
            if(error == null && response.statusCode == 200 && body != null) {
                authentication.accessToken = body.accesstoken;                
                callback(authentication.refreshToken, authentication.accessToken, authentication.sToken);
                authentication.refreshSToken(callback);
            }
            else {
                authentication.accessToken = null;
                authentication.sToken = null;
                callback(authentication.refreshToken, authentication.accessToken, authentication.sToken);
            }
            });
    }

    refreshSToken(callback: (refreshToken: string, accessToken: string, sToken: string) => void) {
        let authentication = this;
        request.post({ url: this.tokensvcUrl + this.tokensvcAccessPath + '?key=' + this.tokensvcApiKey + '&stoken=\'\'', json: {clientid: this.clientId, accesstoken: this.accessToken}}, 
        function(error, response, body) {
            if(error == null && response.statusCode == 200 && body != null) {
                authentication.sToken = body.stoken;
                callback(authentication.refreshToken, authentication.accessToken, authentication.sToken);
            }
            else {
                authentication.sToken = null;
                callback(authentication.refreshToken, authentication.accessToken, authentication.sToken);
            }
            });
    }

    validateSToken(callback: (refreshToken: string, accessToken: string, sToken: string) => void) {
        let authentication = this;
        request.post({ url: this.tokensvcUrl + this.tokensvcValidatePath + '?key=' + this.tokensvcApiKey, json: {clientid: this.clientId, audiences: this.clientId, stoken: this.sToken}}, 
        function(error, response, body) {
            if(error == null && response.statusCode == 200 && body != null) {
                authentication.sToken = authentication.sToken;
                callback(authentication.refreshToken, authentication.accessToken, authentication.sToken);
            }
            else {
                authentication.refreshSToken(callback);
            }
            });
    }
}