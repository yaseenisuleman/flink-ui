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

import { AsyncPipe, NgClass, NgForOf, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { fromEvent, merge } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import {
  QuickSearchComponent,
  QuickSearchItem
} from '@flink-runtime-web/components/quick-search/quick-search.component';
import { StatusService, ThemeService } from '@flink-runtime-web/services';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';

interface NavItem {
  label: string;
  /** Full name for the page search when the sidebar label relies on its section. */
  searchLabel?: string;
  /** Bootstrap Icons class, e.g. "bi-speedometer2". */
  icon: string;
  link: string;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

@Component({
  selector: 'flink-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    AsyncPipe,
    NgClass,
    NgForOf,
    NgIf,
    NzDrawerModule,
    NzAlertModule,
    QuickSearchComponent
  ]
})
export class AppComponent {
  /** Sidebar shown as an overlay on small screens. */
  menuOpen = false;
  visible = false;
  online$ = merge(
    fromEvent(window, 'offline').pipe(map(() => false)),
    fromEvent(window, 'online').pipe(map(() => true))
  ).pipe(startWith(true));

  historyServerEnv = this.statusService.configuration.features['web-history'];
  webSubmitEnabled = this.statusService.configuration.features['web-submit'];
  version = this.statusService.configuration['flink-version'];
  revision = this.statusService.configuration['flink-revision'];

  sections: NavSection[] = this.buildSections();
  searchItems: QuickSearchItem[] = this.sections.reduce<QuickSearchItem[]>(
    (items, section) =>
      items.concat(
        section.items.map(item => ({
          label: item.searchLabel || item.label,
          icon: item.icon,
          link: item.link,
          section: section.heading.charAt(0) + section.heading.slice(1).toLowerCase()
        }))
      ),
    []
  );

  get theme(): string {
    return this.themeService.theme;
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  showMessage(): void {
    if (this.statusService.listOfErrorMessage.length) {
      this.visible = true;
      this.cdr.markForCheck();
    }
  }

  clearMessage(): void {
    this.statusService.listOfErrorMessage = [];
    this.visible = false;
    this.cdr.markForCheck();
  }

  trackByHeading(_: number, section: NavSection): string {
    return section.heading;
  }

  trackByLink(_: number, item: NavItem): string {
    return item.link;
  }

  constructor(
    public statusService: StatusService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef
  ) {}

  private buildSections(): NavSection[] {
    const main: NavItem[] = [{ label: 'Overview', icon: 'bi-speedometer2', link: '/overview' }];
    if (!this.historyServerEnv && this.webSubmitEnabled) {
      main.push({ label: 'Submit New Job', icon: 'bi-upload', link: '/submit' });
    }
    if (!this.historyServerEnv) {
      main.push({ label: 'SQL Editor', icon: 'bi-terminal', link: '/sql' });
    }
    const sections: NavSection[] = [
      { heading: 'MAIN', items: main },
      {
        heading: 'APPLICATIONS',
        items: [
          {
            label: 'Running',
            searchLabel: 'Running Applications',
            icon: 'bi-collection-play',
            link: '/application/running'
          },
          {
            label: 'Completed',
            searchLabel: 'Completed Applications',
            icon: 'bi-collection',
            link: '/application/completed'
          }
        ]
      },
      {
        heading: 'JOBS',
        items: [
          { label: 'Running', searchLabel: 'Running Jobs', icon: 'bi-play-circle', link: '/job/running' },
          { label: 'Completed', searchLabel: 'Completed Jobs', icon: 'bi-check2-circle', link: '/job/completed' }
        ]
      }
    ];
    if (!this.historyServerEnv) {
      sections[2].items.push({ label: 'Savepoints', icon: 'bi-floppy', link: '/savepoints' });
    }
    if (!this.historyServerEnv) {
      sections.push({
        heading: 'CLUSTER',
        items: [
          { label: 'Task Managers', icon: 'bi-cpu', link: '/task-manager' },
          { label: 'Job Manager', icon: 'bi-diagram-3', link: '/job-manager' }
        ]
      });
    }
    return sections;
  }
}
