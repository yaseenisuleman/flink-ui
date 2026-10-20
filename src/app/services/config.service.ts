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

import { Injectable } from '@angular/core';

export type ColorKey =
  | 'TOTAL'
  | 'RUNNING'
  | 'FAILED'
  | 'FINISHED'
  | 'CANCELED'
  | 'CANCELING'
  | 'CREATED'
  | 'DEPLOYING'
  | 'RECONCILING'
  | 'IN_PROGRESS'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'RESTARTING'
  | 'PENDING'
  | 'INITIALIZING'
  | 'IGNORED';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  BASE_URL = '.';

  /**
   * Status colours from the Tabler palette (the same as the --app-* tokens).
   * Badges draw them as soft tints (.tb-status), charts as solid fills.
   */
  COLOR_MAP: Record<ColorKey, string> = {
    TOTAL: '#525252',
    RUNNING: '#2fb344',
    FAILED: '#d63939',
    FINISHED: '#066fd1',
    CANCELED: '#f76707',
    CANCELING: '#f59f00',
    CREATED: '#4263eb',
    DEPLOYING: '#17a2b8',
    RECONCILING: '#d6336c',
    IN_PROGRESS: '#f59f00',
    SCHEDULED: '#ae3ec9',
    COMPLETED: '#066fd1',
    RESTARTING: '#17a2b8',
    INITIALIZING: '#4299e1',
    PENDING: '#737373',
    IGNORED: '#f59f00'
  };

  LONG_MIN_VALUE = -9223372036854776000;
}
