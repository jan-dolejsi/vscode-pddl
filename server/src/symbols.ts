/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Position, Range, MarkedString, Hover, Location, SymbolInformation, SymbolKind
} from 'vscode-languageserver';

import { PddlWorkspace } from '../../common/src/workspace-model';

import { Variable, DomainInfo, PddlRange } from '../../common/src/parser';

export class SymbolInfoProvider {
    workspace: PddlWorkspace;
    constructor(workspace: PddlWorkspace) {
        this.workspace = workspace;
    }

    getHover(fileUri: string, position: Position) {
        let info = this.getSymbolInfo(fileUri, position);
        return info ? info.hover : null;
    }

    getDefinition(fileUri: string, position: Position): Location {
        let info = this.getSymbolInfo(fileUri, position);
        return info ? info.location : null;
    }

    getReferences(fileUri: string, position: Position, includeDeclaration: boolean): Location[] {
        let info = this.getSymbolInfo(fileUri, position);
        if (!info) return [];

        return this.findSymbolReferences(fileUri, info, includeDeclaration);
    }

    getSymbols(fileUri: string): SymbolInformation[] {
        let fileInfo = this.workspace.getFileInfo(fileUri);
        
        if(!fileInfo.isDomain()) return [];
        
        let domainInfo = <DomainInfo>fileInfo;

        let actionSymbols = domainInfo.actions.map(action => SymbolInformation.create(action.name, SymbolKind.Module, SymbolInfoProvider.toRange(action.location)));

        domainInfo.getPredicates().forEach(p => domainInfo.findVariableLocation(p));
        let predicateSymbols = domainInfo.getPredicates().map(variable => SymbolInformation.create(variable.declaredName, SymbolKind.Boolean, SymbolInfoProvider.toRange(variable.location)));
        
        domainInfo.getFunctions().forEach(f => domainInfo.findVariableLocation(f));
        let functionSymbols = domainInfo.getFunctions().map(variable => SymbolInformation.create(variable.declaredName, SymbolKind.Function, SymbolInfoProvider.toRange(variable.location)));

        let symbols = actionSymbols.concat(predicateSymbols, functionSymbols);

        return symbols;
    }
    
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
                    Location.create(domainInfo.fileUri, SymbolInfoProvider.toRange(predicateFound.location)),
                    predicateFound,
                );
            }
            let functionFound = domainInfo.getFunctions().find(f => f.name == symbol.name);
            if (functionFound) {
                domainInfo.findVariableLocation(functionFound);
                return new VariableInfo(
                    this.createHover(symbol.range, 'Function', this.brackets(functionFound.declaredName), functionFound.getDocumentation()),
                    Location.create(domainInfo.fileUri, SymbolInfoProvider.toRange(functionFound.location)),
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
                    null, // todo?
                    symbol.name
                );
            }
        }

        // we return an answer only if we find something
        // otherwise no hover information is given
        return null;
    }

    createHover(range: Range, title: string, symbolName: string, documentation: string) {

        let contents: MarkedString[] = [
            {
                language: 'markdown', value: `## ${title}`
            },
            {
                language: 'pddl', value: symbolName
            },
            {
                language: 'plaintext', value: documentation
            }];

        return {
            contents: contents,
            range: range
        }
    }

    brackets(symbolName: string): string {
        return `(${symbolName})`;
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

        let range = Range.create(
            position.line, position.character - leadingSymbolPart.length,
            position.line, position.character + followingSymbolPart.length - 1);

        return new Symbol(symbolName, range, line);
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
                    locations.push(Location.create(domainInfo.fileUri, SymbolInfoProvider.toRange(range)))
                }else{
                    // we skipped the declaration, but let's include any further references
                    includeReference = true;
                }
            });
         
            // add variable references found in all problem files
            problemFiles.forEach(p => 
                p.getVariableReferences((<VariableInfo>symbol).variable)
                    .forEach(range => locations.push(Location.create(p.fileUri, SymbolInfoProvider.toRange(range)))));
        }

        return locations;
    }

    
    static toRange(pddlRange: PddlRange): Range {
        return Range.create(pddlRange.startLine, pddlRange.startCharacter, pddlRange.endLine, pddlRange.endCharacter);
    }
}

class Symbol {

    constructor(public name: string, public range: Range, public line: string) {
    }

    isPrefixedBy(prefix: string): boolean {
        return this.line.substring(0, this.range.start.character).endsWith(prefix);
    }
}

class SymbolInfo {
    constructor(public hover: Hover, public location: Location) { }
}

class VariableInfo extends SymbolInfo {
    constructor(public hover: Hover, public location: Location, public variable: Variable) {
        super(hover, location);
    }
}

class TypeInfo extends SymbolInfo {
    constructor(public hover: Hover, public location: Location, public type: string) {
        super(hover, location);
    }
}
