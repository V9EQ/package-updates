// SPDX-License-Identifier: GPL-2.0-or-later
import {AptBackend} from '../apt/backend.js';

// Debian-specific behavior belongs here; the safe APT query is shared.
export class DebianBackend extends AptBackend {}
