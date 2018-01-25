/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Position, Range, Hover, Location, Uri, TextDocument, MarkdownString
} from 'vscode';

import { PddlWorkspace } from '../../common/src/workspace-model';

import { Variable, PddlRange } from '../../common/src/parser';

export class SymbolUtils {
    constructor(public workspace: PddlWorkspace) {}
    
    getSymbolInfo(fileUri: string, position: Position): SymbolInfo {
        let fileInfo = this.workspace.getFileInfo(fileUri);

        let domainInfo = this.workspace.asDomain(fileInfo);
        if (!domainInfo) return null;

        let symbol = this.getSymbolOnPosition(fileInfo.text, position);

        if (!symbol) return null;

        if (symbol.isPrefixedBy('(')) {
            let predicateFound = domainInfo.getPredicates().find(p => p.name == symbol.name);
            if (predicateFound) {
                domainInfo.findVariableLocation(predicateFound);
                return new VariableInfo(
                    this.createHover(symbol.range, 'Predicate', this.brackets(predicateFound.declaredName), predicateFound.getDocumentation()),
                    new Location(this.toUri(domainInfo.fileUri), SymbolUtils.toRange(predicateFound.location)),
                    predicateFound,
                );
            }
            let functionFound = domainInfo.getFunctions().find(f => f.name == symbol.name);
            if (functionFound) {
                domainInfo.findVariableLocation(functionFound);
                return new VariableInfo(
                    this.createHover(symbol.range, 'Function', this.brackets(functionFound.declaredName), functionFound.getDocumentation()),
                    new Location(this.toUri(domainInfo.fileUri), SymbolUtils.toRange(functionFound.location)),
                    functionFound
                );
            }
        }
        else if (symbol.isPrefixedBy('- ')) {

            if (domainInfo.getTypes().includes(symbol.name)) {
                let parents = domainInfo.typeInheritance.getVerticesWithEdgesFrom(symbol.name);
                let inheritsFromText = parents.length > 0 ? "Inherits from: " + parents.join(', ') : ""
                return new TypeInfo(
                    this.createHover(symbol.range, 'Type', symbol.name, inheritsFromText),
                    new Location(this.toUri(domainInfo.fileUri), SymbolUtils.toRange(domainInfo.getTypeLocation(symbol.name))),
                    symbol.name
                );
            }
        }

        // we return an answer only if we find something
        // otherwise no hover information is given
        return null;
    }

    leadingSymbolPattern = /([\w_][\w_-]*)$/gi;
    followingSymbolPattern = /^([\w_-]+)/gi;

    getSymbolOnPosition(text: string, position: Position): Symbol {
        let line = text.split('\n')[position.line];
        let leadingText = line.substring(0, position.character);
        let followingText = line.substring(position.character - 1);

        // are we hovering over comments? 
        if (leadingText.includes(';')) return null;

        this.leadingSymbolPattern.lastIndex = 0;
        let match = this.leadingSymbolPattern.exec(leadingText);
        if (!match) return null;
        let leadingSymbolPart = match[1];

        this.followingSymbolPattern.lastIndex = 0;
        match = this.followingSymbolPattern.exec(followingText);
        if (!match) return null;
        let followingSymbolPart = match[1];

        let symbolName = leadingSymbolPart + followingSymbolPart.substr(1);

        let range = new Range(
            position.line, position.character - leadingSymbolPart.length,
            position.line, position.character + followingSymbolPart.length - 1);

        return new Symbol(symbolName, range, line);
    }
    
    createHover(range: Range, title: string, symbolName: string, documentation: string) {

		let markdownString = new MarkdownString(`## ${title}`);
        markdownString.appendCodeblock(symbolName, 'pddl');
        markdownString.appendText(documentation);
        return new Hover(markdownString, range);
    }
    
    findSymbolReferences(fileUri: string, symbol: SymbolInfo, includeDeclaration: boolean): Location[] {
        let fileInfo = this.workspace.getFileInfo(fileUri);

        let domainInfo = this.workspace.asDomain(fileInfo);
        if (!domainInfo) return null;

        let problemFiles = this.workspace.getProblemFiles(domainInfo);

        let locations: Location[] = [];
        let includeReference = includeDeclaration; 
        if (symbol instanceof VariableInfo) {
            // add variable references found in the domain file
            domainInfo.getVariableReferences((<VariableInfo>symbol).variable).forEach(range => {
                if(includeReference){
                    locations.push(new Location(this.toUri(domainInfo.fileUri), SymbolUtils.toRange(range)))
                } else {
                    // we skipped the declaration, but let's include any further references
                    includeReference = true;
                }
            });
         
            // add variable references found in all problem files
            problemFiles.forEach(p => 
                p.getVariableReferences((<VariableInfo>symbol).variable)
                    .forEach(range => locations.push(new Location(this.toUri(p.fileUri), SymbolUtils.toRange(range)))));
        } else if (symbol instanceof TypeInfo) {
            // add type references found in the domain file
            if(includeDeclaration) {
                locations.push(symbol.location);
            }
            let typeName = (<TypeInfo>symbol).type;
            domainInfo.getTypeReferences(typeName).forEach(range => {
                let vsRange = SymbolUtils.toRange(range); 
                if(!vsRange.isEqual(symbol.location.range)){
                    locations.push(new Location(this.toUri(domainInfo.fileUri), vsRange));
                }
            })

            // add type references found in all problem files
            problemFiles.forEach(p =>
                p.getTypeReferences(typeName)
                    .forEach(range => locations.push(new Location(this.toUri(p.fileUri), SymbolUtils.toRange(range))))
            );
        }

        return locations;
    }

    assertFileParsed(document: TextDocument): void {
        let fileUri = document.uri.toString();
        if (!this.workspace.getFileInfo(fileUri)) {
            this.workspace.upsertFile(fileUri, document.version, document.getText());
        }
    }

    static toRange(pddlRange: PddlRange): Range {
        return new Range(pddlRange.startLine, pddlRange.startCharacter, pddlRange.endLine, pddlRange.endCharacter);
    }

    static toLocation(document: TextDocument, pddlRange: PddlRange): Location {
        return new Location(document.uri, SymbolUtils.toRange(pddlRange));
    }

    brackets(symbolName: string): string {
        return `(${symbolName})`;
    }

    toUri(uriString: string): Uri {
        return Uri.parse(uriString);
    }
}

export class Symbol {

    constructor(public name: string, public range: Range, public line: string) {
    }

    isPrefixedBy(prefix: string): boolean {
        return this.line.substring(0, this.range.start.character).endsWith(prefix);
    }
}

export class SymbolInfo {
    constructor(public hover: Hover, public location: Location) { }
}

export class VariableInfo extends SymbolInfo {
    constructor(public hover: Hover, public location: Location, public variable: Variable) {
        super(hover, location);
    }
}

export class TypeInfo extends SymbolInfo {
    constructor(public hover: Hover, public location: Location, public type: string) {
        super(hover, location);
    }
}
