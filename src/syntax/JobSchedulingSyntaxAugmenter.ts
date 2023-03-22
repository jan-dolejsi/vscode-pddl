/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { HoverProvider, ExtensionContext, TextEditor, TextEditorDecorationType, Range, MarkdownString } from 'vscode';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { FileInfo, Action, Variable, Parameter, getTypesInheritingFromPlusSelf, DurativeAction, PDDL } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { nodeToRange } from '../utils';
import { DecorationPosition, DecorationRelativePosition, SyntaxAugmenter } from './SyntaxAugmenter';
import { PddlBracketNode } from 'pddl-workspace/dist/parser';

/** Shows decorations in the PDDL domain. */
export class JobSchedulingSyntaxAugmenter extends SyntaxAugmenter {

    constructor(context: ExtensionContext, pddlWorkspace: CodePddlWorkspace) {
        super(context, pddlWorkspace);
    }

    private static readonly JOB_SCHEDULING_REQ = ':job-scheduling';

    isApplicable(file: FileInfo): boolean {
        if (file instanceof DomainInfo) {
            return file.getRequirements().includes(JobSchedulingSyntaxAugmenter.JOB_SCHEDULING_REQ);
        }
        return false;
    }

    getHoverProvider(): HoverProvider | undefined {
        return undefined;
    }

    /* TYPES */
    private static readonly AVAILABLE = 'available';
    private static readonly LOCATION = 'location';
    private static readonly RESOURCE = 'resource';

    /* PREDICATE NAMES */
    private static readonly IS_AVAILABLE_PREDICATE_NAME = 'is_available';
    private static readonly IS_AVAILABLE_PREDICATE = new Variable(JobSchedulingSyntaxAugmenter.IS_AVAILABLE_PREDICATE_NAME, [
        new Parameter('a', JobSchedulingSyntaxAugmenter.AVAILABLE)
    ]);
    private static readonly LOCATED_AT_PREDICATE_NAME = 'located_at';
    private static readonly LOCATED_AT_PREDICATE = new Variable(JobSchedulingSyntaxAugmenter.LOCATED_AT_PREDICATE_NAME, [
        new Parameter('r', JobSchedulingSyntaxAugmenter.RESOURCE),
        new Parameter('l', JobSchedulingSyntaxAugmenter.LOCATION)
    ]);
    private static readonly JOB_STARTED_SUFFIX = '_started';
    private static readonly JOB_DONE_SUFFIX = '_done';

    /* FUNCTION NAMES */
    static readonly JOB_DURATION_SUFFIX = '_duration';
    private static readonly TRAVEL_TIME = 'travel_time';
    private static readonly TRAVEL_TIME_FUNCTION = new Variable(JobSchedulingSyntaxAugmenter.TRAVEL_TIME, [
        new Parameter('from', JobSchedulingSyntaxAugmenter.LOCATION),
        new Parameter('to', JobSchedulingSyntaxAugmenter.LOCATION)
    ]);

    protected createDecoration(editor: TextEditor, fileInfo: FileInfo): TextEditorDecorationType[] {
        const decorations: TextEditorDecorationType[] = [];
        if (this.isApplicable(fileInfo) && fileInfo instanceof DomainInfo) {
            const domainInfo = fileInfo as DomainInfo;

            const typesNode = domainInfo.getTypesNode();
            if (typesNode) {
                const hover = this.createHoverTitle('Types');
                decorations.push(this.decorateSyntaxNode(typesNode, editor,
                    `${JobSchedulingSyntaxAugmenter.LOCATION} ${JobSchedulingSyntaxAugmenter.RESOURCE} - ${JobSchedulingSyntaxAugmenter.AVAILABLE}`,
                    hover, { position: DecorationPosition.InsideStart, italic: true, margin: true }));
            }

            const locationTypes = getTypesInheritingFromPlusSelf(JobSchedulingSyntaxAugmenter.LOCATION,
                domainInfo.getTypeInheritance());

            const resourceTypes = getTypesInheritingFromPlusSelf(JobSchedulingSyntaxAugmenter.RESOURCE,
                domainInfo.getTypeInheritance());

            const jobs = domainInfo.getJobs();
            const jobDecorations = jobs?.map(j => this.decorateJob(j, editor, locationTypes, resourceTypes));
            if (jobDecorations) {
                decorations.push(...jobDecorations.flatMap(jd => jd.decorations));
            }

            const predicatesNode = domainInfo.getPredicatesNode();
            if (predicatesNode) {
                const predicates = [
                    JobSchedulingSyntaxAugmenter.IS_AVAILABLE_PREDICATE,
                    JobSchedulingSyntaxAugmenter.LOCATED_AT_PREDICATE
                ].concat(jobDecorations?.flatMap(jd => jd.generatedPredicates) ?? []);
                const hover = this.createHoverTitle('Predicates');
                decorations.push(this.decorateSyntaxNode(predicatesNode, editor,
                    predicates.map(p => declaration(p)).join(" "),
                    hover, { position: DecorationPosition.InsideEnd, italic: true }));
            }

            const functionsNode = domainInfo.getFunctionsNode();
            if (functionsNode) {
                const functions = [JobSchedulingSyntaxAugmenter.TRAVEL_TIME_FUNCTION]
                    .concat(jobDecorations?.flatMap(jd => jd.generatedFunctions) ?? []);
                const hover = this.createHoverTitle('Functions');
                decorations.push(this.decorateSyntaxNode(functionsNode, editor,
                    functions.map(f => declaration(f)).join(" "),
                    hover, { position: DecorationPosition.InsideEnd, italic: true }));
            }

            { // move action
                const hover = this.createHoverTitle('Resource move action');
                const moveActionText = `(:durative-action move :parameters (?from ?to - ${JobSchedulingSyntaxAugmenter.LOCATION} ?r - ${JobSchedulingSyntaxAugmenter.RESOURCE}) ...)`;
                decorations.push(this.decorateSyntaxNode(domainInfo.syntaxTree.getDefineNode() as PddlBracketNode,
                    editor, moveActionText, hover, {
                    position: DecorationPosition.InsideEnd, italic: true
                }));
            }
        }
        return decorations;
    }

    private createHoverTitle(generatedEntitiesName: string): MarkdownString {
        return new MarkdownString(generatedEntitiesName + " auto-generated because of the `" + JobSchedulingSyntaxAugmenter.JOB_SCHEDULING_REQ + "` requirement:");
    }

    decorateSyntaxNode(hostNode: PddlBracketNode, editor: TextEditor, decorationText: string, hoverText: MarkdownString | string,
        options: { position: DecorationPosition; italic: boolean, margin?: boolean }): TextEditorDecorationType {
        const doc = editor.document;
        let range: Range;
        let relativePosition: DecorationRelativePosition;
        switch (options.position) {
            case DecorationPosition.InsideStart:
                range = new Range(doc.positionAt(hostNode.getStart()),
                    doc.positionAt(hostNode.getToken().getEnd()));
                relativePosition = DecorationRelativePosition.After;
                break;
            case DecorationPosition.InsideEnd:
                range = new Range(
                    doc.positionAt(hostNode.getEnd() - 1),
                    doc.positionAt(hostNode.getEnd() - 1));
                relativePosition = DecorationRelativePosition.Before;
                break;
            case DecorationPosition.OutsideEnd:
                range = new Range(doc.positionAt(hostNode.getStart()),
                    doc.positionAt(hostNode.getToken().getEnd()));
                relativePosition = DecorationRelativePosition.After;
                break;
            default:
                throw new Error('decoration position not supported: ' + options.position);
        }
        return this.decorateSymbol(editor, decorationText, hoverText, range, {
            italic: options.italic, relativePosition: relativePosition, margin: options.margin
        });
    }

    decorateJob(job: DurativeAction, editor: TextEditor, locationTypes: string[], resourceTypes: string[]): JobDecoration {
        const decoration = new JobDecoration();
        if (!job.duration && job.parametersNode) {
            const durationDef = `:duration (= ?duration ${expression(decoration.createDurationVariable(job, resourceTypes))})`;
            decoration.add(this.decorateSymbol(editor, durationDef,
                'Suggested duration definition', nodeToRange(editor.document, job.parametersNode), {
                italic: true, margin: true, relativePosition: DecorationRelativePosition.After
            }));
        }

        const availabilityVariables: Variable[] = [];

        // the location shall be available
        const locationParameter = job.parameters.find(p => locationTypes.includes(p.type));
        if (locationParameter) {
            const locationIsAvailable = JobSchedulingSyntaxAugmenter.IS_AVAILABLE_PREDICATE.bind([locationParameter]);
            availabilityVariables.push(locationIsAvailable);
        }

        const resourcesAtLocation: Variable[] = [];

        // all resources shall be available and at the location
        job.parameters
            .filter(p => resourceTypes.includes(p.type))
            .forEach(p => {
                const resourceIsAvailable = JobSchedulingSyntaxAugmenter.IS_AVAILABLE_PREDICATE.bind([p]);
                availabilityVariables.push(resourceIsAvailable);

                if (locationParameter) {
                    const resourceAtLocation = JobSchedulingSyntaxAugmenter.LOCATED_AT_PREDICATE.bind([p, locationParameter]);
                    resourcesAtLocation.push(resourceAtLocation);
                }
            });

        const conditions = [...availabilityVariables.map(v => overAll(expression(v)))];
        conditions.push(...resourcesAtLocation.map(p => overAll(expression(p))));

        const jobStarted = decoration.createActionPredicate(job, JobSchedulingSyntaxAugmenter.JOB_STARTED_SUFFIX, resourceTypes);
        const jobDone = decoration.createActionPredicate(job, JobSchedulingSyntaxAugmenter.JOB_DONE_SUFFIX, resourceTypes);

        conditions.push(
            atStart(not(jobStarted)),
            atStart(not(jobDone)),
        );

        const effects: string[] = [];
        effects.push(
            atStart(expression(jobStarted)),
            atEnd(expression(jobDone)),
        );

        availabilityVariables.forEach(e => {
            effects.push(atStart(not(e)));
            effects.push(atEnd(expression(e)));
        });

        const effectsStr = effects.join(' ');
        let footer = '';
        let footerHover = '';

        if (job.condition) {
            decoration.add(this.decorateSyntaxNode(job.condition, editor, conditions.join(' '),
                toMarkdownList('Auto-generated conditions', conditions),
                { position: DecorationPosition.InsideEnd, italic: true }));
        } else {
            footer += '(:condition ' + conditions.join(' ') + ')';
            footerHover += '(:condition ' + conditions.join('\n') + ')';
        }

        if (job.effect) {
            decoration.add(this.decorateSyntaxNode(job.effect, editor, effectsStr,
                toMarkdownList('Auto-generated effects', effects),
                { position: DecorationPosition.InsideEnd, italic: true }));
        } else {
            footer += '(:effect ' + effectsStr + ')';
            footerHover += '(:effect ' + effects.join('\n') + ')';
        }

        if (footer.length) {
            decoration.add(this.decorateSyntaxNode(job.actionNode!, editor, footer,
                'Auto-generated conditions and effects: \n' + footerHover,
                { position: DecorationPosition.InsideEnd, italic: true }));
        }

        return decoration;
    }
}
function declaration(v: Variable): string {
    return '(' + v.getFullName() + ')';
}

function expression(v: Variable): string {
    return '(' + v.declaredNameWithoutTypes + ')';
}

function not(condition: Variable): string {
    return '(not ' + expression(condition) + ')';
}

function atStart(condition: string): string {
    return '(at start ' + condition + ')';
}

function overAll(condition: string): string {
    return '(over all ' + condition + ')';
}

function atEnd(condition: string): string {
    return '(at end ' + condition + ')';
}
function toMarkdownList(intro: string, expressions: string[]): MarkdownString {
    const md = new MarkdownString(intro).appendMarkdown(':\n\n');
    expressions.forEach(e => {
        md.appendCodeblock(e + '\n', PDDL);
    });
    return md;
}

class JobDecoration {
    public readonly decorations: TextEditorDecorationType[] = [];
    public readonly generatedPredicates: Variable[] = [];
    public readonly generatedFunctions: Variable[] = [];

    add(decoration: TextEditorDecorationType): void {
        this.decorations.push(decoration);
    }

    createDurationVariable(action: Action, resourceTypes: string[]): Variable {
        const suffix = JobSchedulingSyntaxAugmenter.JOB_DURATION_SUFFIX;
        return this.createActionFunction(action, suffix, resourceTypes);
    }

    createActionFunction(action: Action, suffix: string, resourceTypes: string[]): Variable {
        const newFunction = this.createActionVariable(action, suffix, resourceTypes);
        this.generatedFunctions.push(newFunction);
        return newFunction;
    }

    createActionPredicate(action: Action, suffix: string, resourceTypes: string[]): Variable {
        const newPredicate = this.createActionVariable(action, suffix, resourceTypes);
        this.generatedPredicates.push(newPredicate);
        return newPredicate;
    }

    private createActionVariable(action: Action, suffix: string, resourceTypes: string[]): Variable {
        return Variable.from(
            action.name + suffix,
            action.parameters.filter(p => !resourceTypes.includes(p.type)));
    }

}