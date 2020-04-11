/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// These are the example settings we defined in the client's package.json
// file
export interface PDDLParserSettings {

	// parsing problem custom matching pattern
	problemPattern: string;
	// Maximum number of problems to be sent back to VS Code
	maxNumberOfProblems: number;

	// Delay in seconds the Language Server should wait after a PDDL file is modified before calls the parser.
	delayInSecondsBeforeParsing: number;

	// path or URL for the PDDL parser executable or service
	executableOrService: string;

	// parser executable options syntax
	executableOptions: string;

	// Service require authentication
	serviceAuthenticationEnabled: boolean;
	// configuration of the parsing service authentication
	serviceAuthenticationUrl: string;
	serviceAuthenticationRequestEncoded: string;
	serviceAuthenticationClientId: string;
	serviceAuthenticationCallbackPort: number;
	serviceAuthenticationTimeoutInMs: number;
	serviceAuthenticationTokensvcUrl: string;
	serviceAuthenticationTokensvcApiKey: string;
	serviceAuthenticationTokensvcAccessPath: string;
	serviceAuthenticationTokensvcValidatePath: string;
	serviceAuthenticationTokensvcCodePath: string;
	serviceAuthenticationTokensvcRefreshPath: string;
	serviceAuthenticationTokensvcSvctkPath: string;
	
	serviceAuthenticationRefreshToken: string;
	serviceAuthenticationAccessToken: string;
	serviceAuthenticationSToken: string;
}
