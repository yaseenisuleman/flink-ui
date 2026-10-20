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

import { NgClass, NgForOf, NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

export interface QuickSearchItem {
  label: string;
  section: string;
  /** Bootstrap Icons class, e.g. "bi-speedometer2". */
  icon: string;
  link: string;
}

const MAX_RESULTS = 8;

/**
 * Page search in the sidebar. Jumps to any dashboard page by name; opens with
 * Ctrl+K / Cmd+K or "/". Searches the sidebar's own entries, no requests.
 */
@Component({
  selector: 'flink-quick-search',
  templateUrl: './quick-search.component.html',
  styleUrls: ['./quick-search.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgForOf, NgIf, NgClass, RouterLink]
})
export class QuickSearchComponent {
  private readonly router = inject(Router);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() items: QuickSearchItem[] = [];
  /** Emits after the search navigated to a page. */
  @Output() readonly navigated = new EventEmitter<void>();
  @ViewChild('input', { static: true }) input: ElementRef<HTMLInputElement>;

  query = '';
  selected = 0;
  isOpen = false;
  matches: QuickSearchItem[] = [];

  open(): void {
    this.isOpen = true;
    this.match();
  }

  close(): void {
    this.isOpen = false;
  }

  onInput(value: string): void {
    this.query = value;
    this.selected = 0;
    this.open();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.matches.length) {
        const step = event.key === 'ArrowDown' ? 1 : this.matches.length - 1;
        this.selected = (this.selected + step) % this.matches.length;
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.matches[this.selected];
      if (item) {
        this.router.navigateByUrl(item.link).then(() => this.done());
      }
    } else if (event.key === 'Escape') {
      this.input.nativeElement.blur();
      this.close();
    }
  }

  done(): void {
    this.query = '';
    this.input.nativeElement.value = '';
    this.input.nativeElement.blur();
    this.close();
    this.navigated.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const active = document.activeElement as HTMLElement | null;
    const typing = !!active && (/INPUT|TEXTAREA|SELECT/.test(active.tagName) || active.isContentEditable);
    if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
      event.preventDefault();
      this.input.nativeElement.focus();
      this.input.nativeElement.select();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  trackByLink(_: number, item: QuickSearchItem): string {
    return item.link;
  }

  private match(): void {
    const q = this.query.trim().toLowerCase();
    this.matches = this.items
      .filter(it => !q || `${it.label} ${it.section}`.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
    this.selected = Math.min(this.selected, Math.max(0, this.matches.length - 1));
  }
}
