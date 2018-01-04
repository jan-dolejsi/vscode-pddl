/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// The settings interface describe the server relevant settings part
export interface Settings {
	pddlParser: PDDLParserSettings;
}

// These are the example settings we defined in the client's package.json
// file
export interface PDDLParserSettings {

	// path or URL for the PDDL parser executable or service
	executableOrService: string;

	// parser executable options syntax
	executableOptions: string;

	serviceAuthenticated: boolean;
	authenticationUrl: string;
	authenticationRequestEncoded: string;
	authenticationClientId: string;
	authenticationTokensvcUrl: string;
	authenticationTokensvcApiKey: string;
	authenticationTokensvcAccessPath: string;
	authenticationTokensvcValidatePath: string;
	authenticationTokensvcCodePath: string;
	authenticationTokensvcRefreshPath: string;
	authenticationTokensvcSvctkPath: string;
	
	authenticationRefreshToken: string;
	authenticationAccessToken: string;
	authenticationSToken: string;

	// parsing problem custom matching pattern
	problemPattern: string;

	// Delay in seconds the Language Server should wait after a PDDL file is modified before calls the parser.
	delayInSecondsBeforeParsing: number;
	// Maximum number of problems to be sent back to VS Code
	maxNumberOfProblems: number;
}
