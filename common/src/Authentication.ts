/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

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
        return new Authentication('https://sauth-dot-cfsauth-qa.appspot.com/v1/auth', 'NjI3NzQ1Nzd7ImNsaWVudGlkIjogImxoODA4MS1hdXRoLXV0aWwtYWlwbGFubmluZy5zbGJhcHAuY29tIiwgInJjYmlkIjoibGg4MDgxLWF1dGgtdXRpbCJ9NjQ5NjczNDg=', 'lh8081-auth-util-aiplanning.slbapp.com',
        'https://tksvc-dot-cfsauth-qa.appspot.com', 'AIzaSyAR9jypT78fsXfO-wZ4sGfiwlonIADNKUA', '/v1/access', '/v1/validate', '/v1/code', '/v1/refresh', '/v1/svctk', null, null, null);
    }

    login(callback: (refreshToken: string, accessToken: string, sToken: string) => void) {
        const uuidv4 = require('uuid/v4');
        var nonce = uuidv4();
        var express = require('express')
        var app = express()
        var bodyParser = require('body-parser')
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

        const opn = require('opn');
        let authUrl = this.authUrl + '?authRequest=' + this.authRequestEncoded + '&nonce=' + nonce + '&refreshtoken&accesstoken&stoken';
        opn(authUrl);
    }

    refreshAccessToken(clientid: string, refreshtoken: string) {
        const request = require('request');
        request.get({ url: this.tokensvcUrl + this.tokensvcRefreshPath + '?key=' + this.tokensvcApiKey + '&accesstoken=\'\'', json: {clientid: clientid, refreshoken: refreshtoken}});
        return false;
    }

    refreshSToken(clientid: string, accesstoken: string) {
        const request = require('request');
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
        const request = require('request');
        request.get({ url: this.tokensvcUrl + this.tokensvcValidatePath + '?key=' + this.tokensvcApiKey, json: {clientid: clientid, audiences: clientid, stoken: stoken}});
        return false;
    }
}