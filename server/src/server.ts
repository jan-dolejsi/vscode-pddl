/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments,
	InitializeResult, TextDocumentPositionParams, CompletionItem, Hover, Definition, Location,
	SymbolInformation
} from 'vscode-languageserver';

import { PddlWorkspace } from '../../common/src/workspace-model';
import { Diagnostics } from './diagnostics';
import { AutoCompletion } from './autocompletion';
import { SymbolInfoProvider } from './symbols';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initialize request. The server receives
// in the passed params the such as rootPath of the workspace plus the client capabilities. 
connection.onInitialize((params): InitializeResult => {

	console.log("Language server initialized for location: " + params.rootPath);

	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: [':', '(', '-']
			},
			hoverProvider: true,
			definitionProvider: true,
			referencesProvider: true,
			documentSymbolProvider: true
		}
	}
});

let workspace = new PddlWorkspace();
documents.all().filter(doc => doc.languageId == 'pddl').forEach(doc => workspace.upsertFile(doc.uri, doc.version, doc.getText()));
let diagnostics: Diagnostics = new Diagnostics(workspace, connection);
let autoCompletion: AutoCompletion = new AutoCompletion(workspace);
let symbolProvider: SymbolInfoProvider = new SymbolInfoProvider(workspace);

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	diagnostics.validatePddlDocumentByUri(change.document.uri, false);
});

// The settings interface describe the server relevant settings part
interface Settings {
	pddlParser: PDDLParserSettings;
}

// These are the example settings we defined in the client's package.json
// file
interface PDDLParserSettings {

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

	// parsing problem custom matching pattern
	problemPattern: string;

	// Delay in seconds the Language Server should wait after a PDDL file is modified before calls the parser.
	delayInSecondsBeforeParsing: number;
	// Maximum number of problems to be sent back to VS Code
	maxNumberOfProblems: number;
}

// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	diagnostics.maxNumberOfProblems = settings.pddlParser.maxNumberOfProblems || 100;
	diagnostics.parserExecutableOrService = settings.pddlParser.executableOrService;
	diagnostics.parserExecutableOptions = settings.pddlParser.executableOptions;
	diagnostics.parserCustomPattern = settings.pddlParser.problemPattern;
	diagnostics.timerDelayInSeconds = settings.pddlParser.delayInSecondsBeforeParsing || diagnostics.timerDelayInSeconds;
	// Revalidate any open text documents
	diagnostics.revalidateAll();
});

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});


// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in 
	// which code complete got requested. 
	return autoCompletion.complete(_textDocumentPosition.textDocument.uri, _textDocumentPosition.position);
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	return autoCompletion.resolve(item);
});


connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	// connection.console.log(`${params.textDocument.uri} opened.`);

	if (params.textDocument.languageId == "pddl") {
		workspace.upsertFile(params.textDocument.uri, params.textDocument.version, params.textDocument.text);
		diagnostics.scheduleValidation();
	}
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	//connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges.map(change => `range: ${change.range}, rangeLength: ${change.rangeLength}, length: ${change.text.length}`))}`);

	if (params.contentChanges.length > 0) {
		workspace.upsertFile(params.textDocument.uri, params.textDocument.version, params.contentChanges[params.contentChanges.length - 1].text);
		diagnostics.scheduleValidation();
	}
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	// connection.console.log(`${params.textDocument.uri} closed.`);

	workspace.removeFile(params.textDocument.uri);
	diagnostics.clearDiagnostics(params.textDocument.uri);
});

connection.onHover(({ textDocument, position }): Hover => {
	return assertFileParsed(textDocument.uri) ? symbolProvider.getHover(textDocument.uri, position) : null;
});

connection.onDefinition(({ textDocument, position }): Definition => {
	return assertFileParsed(textDocument.uri) ? symbolProvider.getDefinition(textDocument.uri, position) : null;
});

connection.onReferences(({textDocument, position, context}): Location[] =>{
	return assertFileParsed(textDocument.uri) ? symbolProvider.getReferences(textDocument.uri, position, context.includeDeclaration) : null;
});

connection.onDocumentSymbol(({textDocument}): SymbolInformation[] => {
	return assertFileParsed(textDocument.uri) ? symbolProvider.getSymbols(textDocument.uri) : [];
});

// Listen on the connection
connection.listen();

function assertFileParsed(fileUri: string): boolean {
	if (!workspace.getFileInfo(fileUri)) {
		let textDocument = documents.get(fileUri);

		if (textDocument) {
			workspace.upsertFile(textDocument.uri, textDocument.version, textDocument.getText());
			diagnostics.scheduleValidation();
		}
		else{
			// not success!
			return false;
		}
	}
	return true;
}