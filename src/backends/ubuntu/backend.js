// SPDX-License-Identifier: GPL-2.0-or-later
import {AptBackend} from '../apt/backend.js';

// Ubuntu-specific behavior belongs here; the safe APT query is shared.
export class UbuntuBackend extends AptBackend {}
