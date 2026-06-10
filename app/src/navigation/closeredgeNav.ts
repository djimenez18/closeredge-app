/**
 * closeredgeNav -- navigation configuration for CloserEdge-specific pages.
 *
 * Exported as an array that can be merged into the existing app navigation.
 * Icon names are Lucide-style identifiers; consuming components resolve them
 * to the actual SVG or icon component they use.
 */

export interface CloserEdgeNavItem {
  /** Display label shown in the navigation UI. */
  label: string;
  /** Route path for react-router navigation. */
  path: string;
  /** Lucide-style icon name (e.g. 'brain', 'users', 'database'). */
  icon: string;
  /** If set, the item is only visible when the subscription tier matches. */
  requiresTier?: 'foundation' | 'pro' | 'elite';
  /** If set, the item is only visible for the specified agent archetype. */
  requiresAgent?: 'eden' | 'crest' | 'forge' | 'haven' | 'lexis' | 'nora';
  /** If set, the item is only visible for users with the specified role. */
  requiresRole?: 'admin';
}

const closeredgeNav: CloserEdgeNavItem[] = [
  { label: 'Hive Mind', path: '/hivemind', icon: 'brain' },
  { label: 'War Room', path: '/warroom', icon: 'users' },
  { label: 'Memory', path: '/memory', icon: 'database' },
  {
    label: 'Adversary',
    path: '/adversary',
    icon: 'shield-alert',
    requiresTier: 'elite',
    requiresAgent: 'lexis',
  },
  { label: 'Admin', path: '/admin', icon: 'settings', requiresRole: 'admin' },
];

export default closeredgeNav;
