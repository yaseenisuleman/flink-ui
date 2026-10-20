/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { DatePipe, NgForOf, NgIf, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  NgZone,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, from, Observable, of, Subject, timer } from 'rxjs';
import { catchError, concatMap, expand, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { HumanizeDurationPipe } from '@flink-runtime-web/components/humanize-duration.pipe';
import { PageHeaderComponent } from '@flink-runtime-web/components/page-header/page-header.component';
import { SqlColumn, SqlFetchResult, SqlGatewayInfo, SqlRow } from '@flink-runtime-web/interfaces';
import { restError, SqlGatewayService } from '@flink-runtime-web/services';
import { editor } from 'monaco-editor';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { EditorOptions, NzCodeEditorModule } from 'ng-zorro-antd/code-editor';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

import { splitStatements } from './sql-statements';

import IStandaloneCodeEditor = editor.IStandaloneCodeEditor;

/** Monaco is loaded at runtime by ng-zorro's code editor (AMD), not bundled. */
declare const monaco: typeof import('monaco-editor');

const DRAFT_KEY = 'flink-sql-draft';
const HISTORY_KEY = 'flink-sql-history';
const MAX_ROWS = 1000;
const MAX_HISTORY = 30;

const SAMPLE = `-- Ctrl+Enter (Cmd+Enter) runs the selection, or everything. End statements with ;
CREATE TABLE IF NOT EXISTS orders (
  id INT,
  amount DOUBLE
) WITH (
  'connector' = 'datagen',
  'rows-per-second' = '5',
  'fields.id.min' = '1',
  'fields.id.max' = '100',
  'fields.amount.min' = '1',
  'fields.amount.max' = '500'
);

SELECT id % 5 AS bucket, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total
FROM orders
GROUP BY id % 5;
`;

type RunStatus = 'running' | 'finished' | 'failed' | 'stopped';

interface StatementRun {
  statement: string;
  status: RunStatus;
  started: number;
  ended?: number;
  rows: number;
  jobId?: string;
  error?: string;
}

/**
 * SQL editor on the Flink SQL Gateway: run statements in a session, see
 * results (streaming results update as a changelog), stop running queries.
 */
@Component({
  selector: 'flink-sql',
  templateUrl: './sql.component.html',
  styleUrls: ['./sql.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIf,
    NgForOf,
    DatePipe,
    UpperCasePipe,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    HumanizeDurationPipe,
    NzCardModule,
    NzButtonModule,
    NzCodeEditorModule,
    NzTableModule,
    NzAlertModule,
    NzSwitchModule,
    NzTooltipModule
  ]
})
export class SqlComponent implements OnInit, OnDestroy {
  private readonly gatewayService = inject(SqlGatewayService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly destroy$ = new Subject<void>();
  private readonly stop$ = new Subject<void>();
  private editorInstance?: IStandaloneCodeEditor;
  private current: { session: string; operation: string } | null = null;

  readonly editorOptions: EditorOptions = {
    language: 'sql',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    fontSize: 13,
    automaticLayout: true,
    readOnly: false,
    glyphMargin: false
  };

  /** undefined while checking, null when no gateway answers. */
  gateway: SqlGatewayInfo | null | undefined = undefined;
  code = SAMPLE;

  running = false;
  active: StatementRun | null = null;
  columns: SqlColumn[] = [];
  rows: unknown[][] = [];
  changes: SqlRow[] = [];
  truncated = false;
  isQuery = false;
  showChanges = false;
  history: StatementRun[] = [];
  now = Date.now();

  ngOnInit(): void {
    this.code = this.read(DRAFT_KEY) ?? SAMPLE;
    this.history = this.readHistory();
    this.checkGateway();
    // Ticks the elapsed time of a running statement
    timer(1000, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.running) {
          this.now = Date.now();
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.closeCurrent();
    this.destroy$.next();
    this.destroy$.complete();
  }

  checkGateway(): void {
    this.gateway = undefined;
    this.cdr.markForCheck();
    this.gatewayService.info().subscribe(info => {
      this.gateway = info;
      this.cdr.markForCheck();
    });
  }

  onEditorInitialized(instance: IStandaloneCodeEditor): void {
    this.editorInstance = instance;
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.zone.run(() => this.run()));
  }

  onCodeChange(code: string): void {
    this.code = code;
    this.write(DRAFT_KEY, code);
  }

  /** Runs the selected text, or the whole editor, statement by statement. */
  run(): void {
    const selection = this.editorInstance?.getSelection();
    const selected =
      selection && !selection.isEmpty() ? this.editorInstance?.getModel()?.getValueInRange(selection) : undefined;
    const statements = splitStatements(selected || this.code);
    if (!statements.length || !this.gateway) {
      return;
    }
    this.stop();
    this.running = true;
    this.cdr.markForCheck();
    from(statements)
      .pipe(
        concatMap(statement => this.runStatement(statement)),
        takeUntil(this.stop$),
        takeUntil(this.destroy$),
        finalize(() => {
          this.running = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ok => {
          if (!ok) {
            // A failed statement stops the ones after it
            this.stop$.next();
          }
        }
      });
  }

  /** Stops the running statement; a streaming query's Flink job is cancelled. */
  stop(): void {
    if (this.active?.status === 'running') {
      this.finishRun('stopped');
    }
    this.closeCurrent();
    this.stop$.next();
  }

  resetSession(): void {
    this.stop();
    this.gatewayService.resetSession().subscribe(() => {
      this.columns = [];
      this.rows = [];
      this.changes = [];
      this.active = null;
      this.cdr.markForCheck();
    });
  }

  useStatement(statement: string): void {
    this.code = statement.endsWith(';') ? statement : `${statement};`;
    this.write(DRAFT_KEY, this.code);
    this.cdr.markForCheck();
  }

  clearHistory(): void {
    this.history = [];
    this.write(HISTORY_KEY, '[]');
    this.cdr.markForCheck();
  }

  cell(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  kindLabel(kind: string): string {
    return { INSERT: '+I', UPDATE_BEFORE: '-U', UPDATE_AFTER: '+U', DELETE: '-D' }[kind] || kind;
  }

  readonly trackByIndex = (index: number): number => index;

  /** Emits true when the statement finished, false when it failed. */
  private runStatement(statement: string): Observable<boolean> {
    this.active = { statement, status: 'running', started: Date.now(), rows: 0 };
    this.columns = [];
    this.rows = [];
    this.changes = [];
    this.truncated = false;
    this.isQuery = false;
    this.now = Date.now();
    this.cdr.markForCheck();
    return this.gatewayService.execute(statement).pipe(
      tap(handles => (this.current = { session: handles.session, operation: handles.operation })),
      switchMap(handles =>
        this.gatewayService
          .fetch(handles.firstResult)
          .pipe(
            expand(page =>
              page.resultType === 'EOS' || !page.nextResultUri
                ? EMPTY
                : timer(this.pollDelay(page)).pipe(switchMap(() => this.gatewayService.fetch(page.nextResultUri!)))
            )
          )
      ),
      tap(page => this.applyPage(page)),
      // Completes when the last page (EOS) has been applied
      map(page => page.resultType === 'EOS'),
      concatMap(done => (done ? of(true) : EMPTY)),
      tap(() => {
        this.current = null;
        this.finishRun('finished');
      }),
      catchError(error => {
        this.current = null;
        this.finishRun('failed', restError(error));
        return of(false);
      })
    );
  }

  private pollDelay(page: SqlFetchResult): number {
    if (page.resultType === 'NOT_READY') {
      return 500;
    }
    return page.results?.data?.length ? 100 : 1000;
  }

  private applyPage(page: SqlFetchResult): void {
    if (!this.active) {
      return;
    }
    if (page.jobID) {
      this.active.jobId = page.jobID;
    }
    if (page.isQueryResult !== undefined) {
      this.isQuery = page.isQueryResult;
    }
    const results = page.results;
    if (results?.columns?.length && !this.columns.length) {
      this.columns = results.columns;
    }
    for (const row of results?.data || []) {
      this.changes.push(row);
      if (row.kind === 'INSERT' || row.kind === 'UPDATE_AFTER') {
        this.rows.push(row.fields);
      } else {
        // -U / -D retract an earlier row with the same values
        const key = JSON.stringify(row.fields);
        const index = this.rows.findIndex(fields => JSON.stringify(fields) === key);
        if (index > -1) {
          this.rows.splice(index, 1);
        }
      }
    }
    if (this.rows.length > MAX_ROWS) {
      this.rows.splice(0, this.rows.length - MAX_ROWS);
      this.truncated = true;
    }
    if (this.changes.length > MAX_ROWS) {
      this.changes.splice(0, this.changes.length - MAX_ROWS);
    }
    this.rows = [...this.rows];
    this.changes = [...this.changes];
    this.active.rows = this.rows.length;
    this.cdr.markForCheck();
  }

  private finishRun(status: RunStatus, error?: string): void {
    if (!this.active || this.active.status !== 'running') {
      return;
    }
    this.active = { ...this.active, status, error, ended: Date.now() };
    this.history = [this.active, ...this.history].slice(0, MAX_HISTORY);
    this.write(HISTORY_KEY, JSON.stringify(this.history));
    this.cdr.markForCheck();
  }

  private closeCurrent(): void {
    if (this.current) {
      this.gatewayService.close(this.current.session, this.current.operation).subscribe();
      this.current = null;
    }
  }

  private readHistory(): StatementRun[] {
    try {
      const list = JSON.parse(this.read(HISTORY_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Storage unavailable: the draft and history last for this visit only
    }
  }
}
