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

    static create() {        
        return new Authentication('https://sauth-dot-cfsauth-qa.appspot.com/v1/auth', 'ODU0MDYwNDd7ImNsaWVudGlkIjoibGg4MDgxLXZzY29kZS1wZGRsLWFpcGxhbm5pbmcuc2xiYXBwLmNvbSIsICJyY2JpZCI6ImxoODA4MS12c2NvZGUtcGRkbCJ9NDkwNTk5NzA=', 'lh8081-vscode-pddl-aiplanning.slbapp.com',
        'https://tksvc-dot-cfsauth-qa.appspot.com', 'AIzaSyAR9jypT78fsXfO-wZ4sGfiwlonIADNKUA', '/v1/access', '/v1/validate', '/v1/code', '/v1/refresh', '/v1/svctk', null, null, null);
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

    refreshAccessToken(clientid: string, refreshtoken: string) {
        request.get({ url: this.tokensvcUrl + this.tokensvcRefreshPath + '?key=' + this.tokensvcApiKey + '&accesstoken=\'\'', json: {clientid: clientid, refreshoken: refreshtoken}});
        return false;
    }

    refreshSToken(clientid: string, accesstoken: string) {
        request.get({ url: this.tokensvcUrl + this.tokensvcAccessPath + '?key=' + this.tokensvcApiKey + '&stoken=\'\'', json: {clientid: clientid, accesstoken: accesstoken}});
        return false;
    }

    getValidSToken() {
        if(this.sToken == null) {
            if(this.accessToken == null) {
                if(this.refreshToken == null) {
                    this.sToken = null;
                }
                else {
                    if(this.refreshAccessToken(this.clientId, this.refreshToken)) {
                        this.sToken = this.getValidSToken();
                    }
                    else {
                        this.sToken = null;
                    }
                }
            }
            else {
                if(!this.refreshSToken(this.clientId, this.accessToken)) {
                    this.sToken = null;
                }
            }
        }
        else {
            if(!this.validateSToken(this.clientId, this.sToken)) {
                this.sToken = null;
                this.sToken = this.getValidSToken();
            }
        }
        return this.sToken;
    }    

    validateSToken(clientid: string, stoken: string) {
        request.get({ url: this.tokensvcUrl + this.tokensvcValidatePath + '?key=' + this.tokensvcApiKey, json: {clientid: clientid, audiences: clientid, stoken: stoken}});
        return false;
    }
}