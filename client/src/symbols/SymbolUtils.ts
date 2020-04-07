/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Position, Range, Hover, Location, Uri, TextDocument, MarkdownString
} from 'vscode';

import { Action, DomainInfo } from 'pddl-workspace';
import { Variable } from 'pddl-workspace';
import { PddlRange } from 'pddl-workspace';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { parser } from 'pddl-workspace';
import { nodeToRange, toRange } from '../utils';

export class SymbolUtils {
    constructor(public workspace: CodePddlWorkspace) { }

    getSymbolInfo(document: TextDocument, position: Position): SymbolInfo | undefined {
        const fileInfo = this.workspace.getFileInfo(document);
        if (!fileInfo) { throw new Error(`Pddl file not found in the PDDL workspace model: ` + document.uri.toString()); }

        const domainInfo = this.workspace.pddlWorkspace.asDomain(fileInfo);
        if (!domainInfo) { return undefined; }

        const symbolAtPosition = this.getSymbolAtPosition(document, position);

        if (!symbolAtPosition) { return undefined; }
        const symbol: DocSymbol = symbolAtPosition;

        if (symbol.isPrefixedBy('(')) {
            const symbolName = symbol.name.toLowerCase();
            const predicateFound = domainInfo.getPredicates().find(p => p.matchesShortNameCaseInsensitive(symbol.name));
            if (predicateFound) {
                return new VariableInfo(
                    this.createHover(symbol.range, 'Predicate', this.brackets(predicateFound.declaredName), predicateFound.getDocumentation()),
                    new Location(this.toUri(domainInfo.fileUri), toRange(predicateFound.getLocation())),
                    predicateFound,
                );
            }
            const functionFound = domainInfo.getFunctions().find(f => f.matchesShortNameCaseInsensitive(symbol.name));
            if (functionFound) {
                return new VariableInfo(
                    this.createHover(symbol.range, 'Function', this.brackets(functionFound.declaredName), functionFound.getDocumentation()),
                    new Location(this.toUri(domainInfo.fileUri), toRange(functionFound.getLocation())),
                    functionFound
                );
            }
            const derivedFound = domainInfo.getDerived().find(d => d.matchesShortNameCaseInsensitive(symbol.name));
            if (derivedFound) {
                return new VariableInfo(
                    this.createHover(symbol.range, 'Derived predicate/function', this.brackets(derivedFound.declaredName), derivedFound.getDocumentation()),
                    new Location(this.toUri(domainInfo.fileUri), toRange(derivedFound.getLocation())),
                    derivedFound
                );
            }
            const actionFound = domainInfo.getActions().find(a => a.name?.toLowerCase() === symbolName);
            if (actionFound) {
                return new ActionInfo(
                    this.createActionHover(symbol.range, actionFound),
                    new Location(this.toUri(domainInfo.fileUri), toRange(actionFound.getLocation())),
                    actionFound
                );
            }
        }
        else if (symbol.isPrefixedBy('- ') || domainInfo.getTypes().includes(symbol.name)) {

            if (domainInfo.getTypes().includes(symbol.name)) {
                const parents = domainInfo.getTypeInheritance().getVerticesWithEdgesFrom(symbol.name);
                const inheritsFromText = parents && parents.length > 0 ? "Inherits from: " + parents.join(', ') : "";
                const typeLocation = domainInfo.getTypeLocation(symbol.name);
                if (!typeLocation) { return undefined; }
                return new TypeInfo(
                    this.createHover(symbol.range, 'Type', symbol.name, [inheritsFromText]),
                    new Location(this.toUri(domainInfo.fileUri), toRange(typeLocation)),
                    symbol.name
                );
            }
        }
        else if (symbol.isPrefixedBy('?')) {
            if (fileInfo.isDomain()) {
                const parameterNode = domainInfo.syntaxTree.getNodeAt(document.offsetAt(symbol.range.start));

                const scopeNode = parameterNode.findParametrisableScope(symbol.name);
                if (scopeNode) {
                    const indexOfParamDeclaration = scopeNode ?
                        scopeNode.getText().indexOf('?' + symbol.name) :
                        parameterNode.getStart();

                    return new ParameterInfo(
                        this.createHover(symbol.range, 'Parameter', parameterNode.getToken().tokenText, []),
                        new Location(document.uri, document.positionAt(indexOfParamDeclaration)),
                        scopeNode,
                        symbol.name
                    );
                }
            }
        }

        // we return an answer only if we find something
        // otherwise no hover information is given
        return undefined;
    }

    getWordAtDocumentPosition(document: TextDocument, position: Position): WordOnPositionContext | undefined {
        // find the word at the position leveraging the TextDocument facility
        const wordRange = document.getWordRangeAtPosition(position, /\w[-\w]*/);
        if (!wordRange || wordRange.isEmpty || !wordRange.isSingleLine) { return undefined; }

        const word = document.getText(wordRange);
        const lineIdx = wordRange.start.line;
        const before = document.getText(new Range(new Position(lineIdx, 0), wordRange.start));
        const after = document.getText(new Range(wordRange.end, new Position(lineIdx, Number.MAX_SAFE_INTEGER)));
        const line = document.getText(new Range(lineIdx, 0, lineIdx, Number.MAX_SAFE_INTEGER));

        return { before: before, word: word, after: after, range: wordRange, line: line };
    }

    private readonly leadingSymbolPattern = /([\w_][\w_-]*)$/gi;
    private readonly followingSymbolPattern = /^([\w_-]+)/gi;

    getWordAtTextPosition(text: string, position: Position): WordOnPositionContext | undefined {
        const line = text.split('\n')[position.line];
        const leadingText = line.substring(0, position.character);
        const followingText = line.substring(position.character - 1);

        this.leadingSymbolPattern.lastIndex = 0;
        let match = this.leadingSymbolPattern.exec(leadingText); //todo: this pattern does not match, if the word was selected
        if (!match) { return undefined; }
        const leadingSymbolPart = match[1];

        this.followingSymbolPattern.lastIndex = 0;
        match = this.followingSymbolPattern.exec(followingText);
        if (!match) { return undefined; }
        const followingSymbolPart = match[1];

        const symbolName = leadingSymbolPart + followingSymbolPart.substr(1);

        const range = new Range(
            position.line, position.character - leadingSymbolPart.length,
            position.line, position.character + followingSymbolPart.length - 1);

        return {
            before: line.substring(0, range.start.character),
            word: symbolName,
            after: line.substring(range.end.character + 1),
            line: line,
            range: range
        };
    }

    getSymbolAtPosition(document: TextDocument, position: Position): DocSymbol | undefined {
        const wordContext = this.getWordAtDocumentPosition(document, position);

        // is the position not a word, or within comments?
        if (wordContext === undefined || wordContext.before.includes(';')) { return undefined; }

        return new DocSymbol(wordContext.word, wordContext.range, wordContext.line);
    }

    createHover(range: Range, title: string, symbolName: string, documentation: string[]): Hover {
        const markdownString = this.createSymbolMarkdownDocumentation(title, symbolName, documentation);
        return new Hover(markdownString, range);
    }

    createSymbolMarkdownDocumentation(title: string | undefined, symbolName: string, documentation: string[]): MarkdownString {
        const markdownString = new MarkdownString(title ? `**${title}**` : undefined);
        markdownString.appendCodeblock(symbolName, 'pddl');
        documentation.forEach(d => markdownString.appendText(END_LINE + END_LINE).appendMarkdown(d));
        return markdownString;
    }

    createActionHover(range: Range, action: Action): Hover {
        let label = 'Action';
        if (action.isDurative()) { label = 'Durative ' + label; }

        let doc = new MarkdownString(`**${label}**`)
            .appendCodeblock(action.name ?? "", 'pddl');

        if (action.parameters.length) {
            doc = doc.appendMarkdown('Parameters:' + END_LINE + END_LINE);
            action.parameters.forEach(p => doc.appendMarkdown('* `' + p.toPddlString() + '`' + END_LINE));
        }

        action.getDocumentation().forEach(d => doc.appendText(END_LINE + END_LINE).appendMarkdown(d));

        return new Hover(doc, range);
    }

    findSymbolReferences(document: TextDocument, symbol: SymbolInfo, includeDeclaration: boolean): Location[] | undefined {
        const fileInfo = this.workspace.getFileInfo(document);
        if (!fileInfo) {
            console.log(`File ${document.uri.toString()} not know to the PDDL workspace.`);
            return undefined;
        }
        const domainInfoFound = this.workspace.pddlWorkspace.asDomain(fileInfo);
        if (!domainInfoFound) { return undefined; }
        const domainInfo: DomainInfo = domainInfoFound;

        const problemFiles = this.workspace.pddlWorkspace.getProblemFiles(domainInfo);

        let locations: Location[] = [];
        let includeReference = includeDeclaration;
        if (symbol instanceof VariableInfo) {
            // add variable references found in the domain file
            domainInfo.getVariableReferences((symbol as VariableInfo).variable).forEach(range => {
                if (includeReference) {
                    locations.push(new Location(this.toUri(domainInfo.fileUri), toRange(range)));
                } else {
                    // we skipped the declaration, but let's include any further references
                    includeReference = true;
                }
            });

            // add variable references found in all problem files
            problemFiles.forEach(p =>
                p.getVariableReferences((symbol as VariableInfo).variable)
                    .forEach(range => locations.push(new Location(this.toUri(p.fileUri), toRange(range)))));
        } else if (symbol instanceof TypeInfo) {
            // add type references found in the domain file
            if (includeDeclaration) {
                locations.push(symbol.location);
            }
            const typeName = (symbol as TypeInfo).type;
            domainInfo.getTypeReferences(typeName).forEach(range => {
                const vsRange = toRange(range);
                if (!vsRange.isEqual(symbol.location.range)) {
                    locations.push(new Location(this.toUri(domainInfo.fileUri), vsRange));
                }
            });

            // add type references found in all problem files
            problemFiles.forEach(p =>
                p.getTypeReferences(typeName)
                    .forEach(range => locations.push(new Location(this.toUri(p.fileUri), toRange(range))))
            );
        } else if (symbol instanceof ParameterInfo) {
            const parameterInfo = symbol as ParameterInfo;

            parameterInfo.scopeNode.getChildrenRecursively(
                node => node.isType(parser.PddlTokenType.Parameter) && node.getToken().tokenText === '?' + symbol.name,
                node => locations.push(new Location(document.uri, nodeToRange(document, node)))
            );

            if (!includeDeclaration) {
                locations = locations.slice(1);
            }
        }

        return locations;
    }

    async assertFileParsed(document: TextDocument): Promise<void> {
        if (!this.workspace.getFileInfo(document)) {
            await this.workspace.upsertAndParseFile(document);
        }
    }

    static toLocation(document: TextDocument, pddlRange: PddlRange): Location {
        return new Location(document.uri, toRange(pddlRange));
    }

    brackets(symbolName: string): string {
        return `(${symbolName})`;
    }

    toUri(uriString: string): Uri {
        return Uri.parse(uriString);
    }
}

export class DocSymbol {

    constructor(public name: string, public range: Range, public line: string) {
    }

    isPrefixedBy(prefix: string): boolean {
        return this.line.substring(0, this.range.start.character).endsWith(prefix);
    }
}

export class SymbolInfo {
    /**
     * Creates symbol information.
     * @param hover hover info
     * @param location location of the symbol's declaration
     */
    constructor(public readonly hover: Hover, public readonly location: Location) { }
}

export class VariableInfo extends SymbolInfo {
    constructor(hover: Hover, location: Location, public readonly variable: Variable) {
        super(hover, location);
    }
}

export class TypeInfo extends SymbolInfo {
    constructor(hover: Hover, location: Location, public type: string) {
        super(hover, location);
    }
}

export class ActionInfo extends SymbolInfo {
    constructor(hover: Hover, location: Location, public action: Action) {
        super(hover, location);
    }
}

export class ParameterInfo extends SymbolInfo {
    constructor(hover: Hover, location: Location,
        public readonly scopeNode: parser.PddlSyntaxNode, public readonly name: string) {
        super(hover, location);
    }
}

interface WordOnPositionContext {
    before: string;
    word: string;
    after: string;
    line: string;
    range: Range;
}

const END_LINE = `
`;