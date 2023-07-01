/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { Node } from 'jsonc-parser';
import { ExtensionContext, Uri, workspace, window, Range, TextDocument, Position, FileSystem } from 'vscode';
import { FileType, PddlFileSystem, utils, PddlExtensionContext, PddlRange, PddlPosition, parser } from 'pddl-workspace';
import { URI } from 'vscode-uri';

export function createPddlExtensionContext(context: ExtensionContext): PddlExtensionContext {
    return {
        asAbsolutePath: context.asAbsolutePath,
        extensionPath: context.extensionPath,
        storagePath: context.storagePath,
        storageUri: context.storageUri,
        subscriptions: context.subscriptions,
        pythonPath: function (): string { return workspace.getConfiguration().get("python.pythonPath", "python"); }
    };
}

export function toPddlFileSystem(fileSystem: FileSystem): PddlFileSystem {
    return {
        readDirectory: async (uri: URI): Promise<[string, FileType][]> => await fileSystem.readDirectory(uri),
        readFile: async (uri: URI) => await fileSystem.readFile(uri)
    };
}

export interface WebviewUriConverter {
    asWebviewUri(localResource: Uri): Uri;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export function firstIndex<T>(array: T[], fn: (t: T) => boolean): number {
    for (let i = 0; i < array.length; i++) {
        if (fn(array[i])) {
            return i;
        }
    }

    return -1;
}

export function compareMaps(map1: Map<string, string>, map2: Map<string, string>): boolean {
    let testVal;
    if (map1.size !== map2.size) {
        return false;
    }
    for (const [key, val] of map1) {
        testVal = map2.get(key);
        // in cases of an undefined value, make sure the key
        // actually exists on the object so there are no false positives
        if (testVal !== val || (testVal === undefined && !map2.has(key))) {
            return false;
        }
    }
    return true;
}

/**
 * Relative fuzzy time in a human readable form.
 * @param time date time
 */
export function toFuzzyRelativeTime(time: number): string {
    const delta = Math.round((+new Date - time) / 1000);

    const minute = 60,
        hour = minute * 60,
        day = hour * 24;

    let fuzzy;

    if (delta < 30) {
        fuzzy = 'just now';
    } else if (delta < minute) {
        fuzzy = delta + ' seconds ago';
    } else if (delta < 2 * minute) {
        fuzzy = 'a minute ago';
    } else if (delta < hour) {
        fuzzy = Math.floor(delta / minute) + ' minutes ago';
    } else if (Math.floor(delta / hour) === 1) {
        fuzzy = '1 hour ago';
    } else if (delta < day) {
        fuzzy = Math.floor(delta / hour) + ' hours ago';
    } else if (delta < day * 2) {
        fuzzy = 'yesterday';
    }
    else {
        fuzzy = Math.floor(delta / day) + ' days ago';
    }

    return fuzzy;
}

export function showError(reason: Error): void {
    console.error(reason);
    window.showErrorMessage(reason.message ?? reason);
}

export function throwForUndefined<T>(part: string): T {
    throw new Error(`No ${part} defined.`);
}

export function assertDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined || value === null) {
        throw new Error("Assertion error: " + message);
    }
    else {
        return value;
    }
}

/**
 * Absolute path, unless it relied on a %path% location (i.e. there was no dirname). 
 * 
 * This is here merely for background compatibility with previous val configuration storage
 * @param configuredPath a configured path to an executable
 */
export function ensureAbsoluteGlobalStoragePath(configuredPath: string | undefined, context: ExtensionContext): string | undefined {
    if (!configuredPath) { return undefined; }

    if (isHttp(configuredPath)) {
        return configuredPath;
    }

    // if the path is absolute, or contains just the name of an executable (obviously relying on the %path&), return it as is
    if (path.isAbsolute(configuredPath) || !path.dirname(configuredPath)) {
        return configuredPath;
    }
    else {
        // this is here merely for background compatibility with previous val configuration storage
        if (configuredPath.startsWith(path.join('val', 'Val-'))) {
            return path.join(context.globalStoragePath, configuredPath);
        }
        else {
            return configuredPath;
        }
    }
}

export function isHttp(path: string): boolean {
    return path.match(/^http[s]?:/i) !== null;
}

export function toURI(uri: Uri): URI {
    return URI.parse(uri.toString());
}

export function toUri(uri: URI): Uri {
    return Uri.parse(uri.toString());
}

export function toRange(pddlRange: PddlRange): Range {
    return new Range(toPosition(pddlRange.start), toPosition(pddlRange.end));
}

export function nodeToRange(document: TextDocument, node: parser.PddlSyntaxNode): Range {
    return new Range(document.positionAt(node.getStart()), document.positionAt(node.getEnd()));
}

export function toPosition(position: PddlPosition): Position {
    return new Position(position.line, position.character);
}

export function jsonNodeToRange(document: TextDocument, node: Node): Range {
    return new Range(
        document.positionAt(node.offset),
        document.positionAt(node.offset + node.length));
}

export class UriMap<T> extends utils.StringifyingMap<Uri, T> {
    protected stringifyKey(key: Uri): string {
        return key.toString();
    }
}
