/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class Authentication {
    private authUrl: string;
    private authRequestEncoded: string;
    private clientid: string;
    private tokensvcUrl: string;
    private tokensvcApiKey: string;
    private tokensvcAccessPath: string;
    private tokensvcValidatePath: string;
    private tokensvcCodePath: string;
    private tokensvcRefreshPath: string;
    private tokensvcSvctkPath: string;

    refreshtoken: string;
    accesstoken: string;
    stoken: string;
    
    constructor() {
        this.authUrl = 'https://sauth-dot-cfsauth-qa.appspot.com/v1/auth';
        this.authRequestEncoded = 'NjI3NzQ1Nzd7ImNsaWVudGlkIjogImxoODA4MS1hdXRoLXV0aWwtYWlwbGFubmluZy5zbGJhcHAuY29tIiwgInJjYmlkIjoibGg4MDgxLWF1dGgtdXRpbCJ9NjQ5NjczNDg=';
        this.clientid = 'lh8081-auth-util-aiplanning.slbapp.com';
        this.tokensvcUrl = 'https://tksvc-dot-cfsauth-qa.appspot.com';
        this.tokensvcApiKey = 'AIzaSyAR9jypT78fsXfO-wZ4sGfiwlonIADNKUA';
        this.tokensvcAccessPath = '/v1/access';
        this.tokensvcValidatePath = '/v1/validate';
        this.tokensvcCodePath = '/v1/code';
        this.tokensvcRefreshPath = '/v1/refresh';
        this.tokensvcSvctkPath = '/v1/svctk';
        this.display();
    }

    display() {
        console.log(this.authUrl);
        console.log(this.authRequestEncoded);
        console.log(this.clientid);
        console.log(this.tokensvcUrl);
        console.log(this.tokensvcApiKey);
        console.log(this.tokensvcAccessPath);
        console.log(this.tokensvcValidatePath);
        console.log(this.tokensvcCodePath);
        console.log(this.tokensvcRefreshPath);
        console.log(this.tokensvcSvctkPath);
    }

    login() {
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
                thisAuthentication.refreshtoken = req.body.refreshtoken;
                thisAuthentication.accesstoken = req.body.accesstoken;
                thisAuthentication = req.body.stoken;
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
        if(this.stoken == null) {
            if(this.accesstoken == null) {
                if(this.refreshtoken == null) {
                    this.stoken = null;
                }
                else {
                    if(this.refreshAccessToken(this.clientid, this.refreshtoken)) {
                        this.stoken = this.getValidSToken();
                    }
                    else {
                        this.stoken = null;
                    }
                }
            }
            else {
                if(!this.refreshSToken(this.clientid, this.accesstoken)) {
                    this.stoken = null;
                }
            }
        }
        else {
            if(!this.validateSToken(this.clientid, this.stoken)) {
                this.stoken = null;
                this.stoken = this.getValidSToken();
            }
        }
        return this.stoken;
    }    

    validateSToken(clientid: string, stoken: string) {
        const request = require('request');
        request.get({ url: this.tokensvcUrl + this.tokensvcValidatePath + '?key=' + this.tokensvcApiKey, json: {clientid: clientid, audiences: clientid, stoken: stoken}});
        return false;
    }
}