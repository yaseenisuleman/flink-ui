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

import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { NzConfigService } from 'ng-zorro-antd/core/config';

export type Theme = 'light' | 'dark';

/** localStorage key; index.html reads it too, to set the theme before first paint. */
export const THEME_STORAGE_KEY = 'flink-theme';

/** The theme index.html applied to <html> before Angular started. */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function editorTheme(theme: Theme): string {
  return theme === 'dark' ? 'vs-dark' : 'vs';
}

/**
 * Light/dark theme of the dashboard. The styles key off data-theme on <html>;
 * the Monaco editors (logs, stdout, exceptions) are switched through
 * ng-zorro's code editor config.
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly nzConfigService = inject(NzConfigService);

  readonly theme$ = new BehaviorSubject<Theme>(currentTheme());

  get theme(): Theme {
    return this.theme$.value;
  }

  toggle(): void {
    this.set(this.theme === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      // Storage can be unavailable (private windows, blocked site data); the theme still applies.
    }
    this.nzConfigService.set('codeEditor', { defaultEditorOption: { theme: editorTheme(theme) } });
    this.theme$.next(theme);
  }
}
