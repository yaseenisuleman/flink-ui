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

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, Subscription, timer } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';

import { SqlFetchResult, SqlGatewayInfo } from '@flink-runtime-web/interfaces';

const HEARTBEAT_MS = 60 * 1000;

/** Where the dashboard reaches the SQL Gateway: a Traefik route on the dashboard's own host. */
export const SQL_GATEWAY_BASE = './sql-gateway';

/**
 * Flink SQL Gateway REST API (v1). Keeps one session per browser tab, sent a
 * heartbeat while the tab is open, so tables and settings created on the SQL
 * page survive navigating around the dashboard.
 */
@Injectable({
  providedIn: 'root'
})
export class SqlGatewayService {
  private readonly httpClient = inject(HttpClient);

  private session$?: Observable<string>;
  private heartbeat?: Subscription;

  /** GET /v1/info: emits null when no gateway answers. */
  info(): Observable<SqlGatewayInfo | null> {
    return this.httpClient.get<SqlGatewayInfo>(`${SQL_GATEWAY_BASE}/v1/info`).pipe(catchError(() => of(null)));
  }

  /** The tab's session handle; opens a session on first use. */
  session(): Observable<string> {
    if (!this.session$) {
      this.session$ = this.httpClient
        .post<{ sessionHandle: string }>(`${SQL_GATEWAY_BASE}/v1/sessions`, {
          sessionName: 'flink-web-dashboard',
          properties: {}
        })
        .pipe(
          map(res => res.sessionHandle),
          tap(handle => this.startHeartbeat(handle)),
          catchError(error => {
            this.session$ = undefined;
            throw error;
          }),
          shareReplay(1)
        );
    }
    return this.session$;
  }

  /** Drops the session (and everything created in it); the next statement opens a new one. */
  resetSession(): Observable<void> {
    const current = this.session$;
    this.session$ = undefined;
    this.heartbeat?.unsubscribe();
    if (!current) {
      return of(undefined);
    }
    return current.pipe(
      switchMap(handle => this.httpClient.delete<void>(`${SQL_GATEWAY_BASE}/v1/sessions/${handle}`)),
      map(() => undefined),
      catchError(() => of(undefined))
    );
  }

  /** POST .../statements: emits the operation's first result URI. */
  execute(statement: string): Observable<{ session: string; operation: string; firstResult: string }> {
    return this.session().pipe(
      switchMap(session =>
        this.httpClient
          .post<{ operationHandle: string }>(`${SQL_GATEWAY_BASE}/v1/sessions/${session}/statements`, { statement })
          .pipe(
            map(res => ({
              session,
              operation: res.operationHandle,
              firstResult: `/v1/sessions/${session}/operations/${res.operationHandle}/result/0`
            }))
          )
      )
    );
  }

  /** GET a result page; uri is the gateway's nextResultUri (or the first result URI). */
  fetch(uri: string): Observable<SqlFetchResult> {
    return this.httpClient.get<SqlFetchResult>(`${SQL_GATEWAY_BASE}${uri}`);
  }

  /** DELETE .../close: ends the operation; for a streaming query this cancels its Flink job. */
  close(session: string, operation: string): Observable<void> {
    return this.httpClient
      .delete<void>(`${SQL_GATEWAY_BASE}/v1/sessions/${session}/operations/${operation}/close`)
      .pipe(catchError(() => of(undefined)));
  }

  private startHeartbeat(handle: string): void {
    this.heartbeat?.unsubscribe();
    this.heartbeat = timer(HEARTBEAT_MS, HEARTBEAT_MS)
      .pipe(
        switchMap(() =>
          this.httpClient.post(`${SQL_GATEWAY_BASE}/v1/sessions/${handle}/heartbeat`, {}).pipe(
            catchError(() => {
              // Session expired or gateway restarted: open a new one on the next statement
              this.session$ = undefined;
              this.heartbeat?.unsubscribe();
              return of(null);
            })
          )
        )
      )
      .subscribe();
  }
}
