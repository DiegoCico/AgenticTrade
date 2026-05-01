# Agentictrade Frontend

React-based frontend for the Agentictrade personal finance management platform.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Application                        │
│                  (src/App.tsx)                              │
└─────────────────────┬───────────────────────────────────┘
                          │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Pages   │  │Components│  │ Services │
    └──────────┘  └──────────┘  └──────────┘
```

## 📁 Directory Structure

```
src/
├── components/           # Reusable UI components
│   ├── auth/           # Auth-related components
│   │   ├── AuthForm.tsx
│   │   └── ProtectedRoute.tsx
│   │
│   ├── budgets/        # Budget components
│   │   ├── BudgetCard.tsx
│   │   ├── BudgetSummaryCards.tsx
│   │   ├── CreateBudgetModal.tsx
│   │   ├── EditBudgetModal.tsx
│   │   ├── MonthlyBudgetPlanner.tsx
│   │   └── index.ts
│   │
│   ├── cards/          # Card components
│   ├── categories/     # Category components
│   │   ├── AssignmentsTab.tsx
│   │   ├── CategoriesTab.tsx
│   │   └── CategoryCard.tsx
│   │
│   ├── charts/        # Chart components
│   │   ├── AreaChart.tsx
│   │   ├── BarChart.tsx
│   │   ├── DonutChart.tsx
│   │   └── LineChart.tsx
│   │
│   ├── layout/        # Layout components
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   │
│   ├── modals/        # Modal components
│   │   └── SettingsModal.tsx
│   │
│   ├── plaid/         # Plaid components
│   ├── planner/       # Planner components
│   ├── tables/        # Table components
│   ├── transactions/  # Transaction components
│   │   └── CalendarView.tsx  # Calendar view for transactions
│   └── widgets/        # Widget components
│
├── pages/              # Route pages
│   ├── Dashboard.tsx       # Dashboard overview
│   ├── Transactions.tsx    # Transaction list
│   ├── Categories.tsx      # Category management
│   ├── Budgets.tsx         # Budget management
│   ├── Investments.tsx      # Investment tracking
│   ├── Planner.tsx         # Savings planner
│   ├── SignIn.tsx          # Sign in page
│   ├── SignUp.tsx         # Sign up page
│   ├── ConfirmSignUp.tsx  # Email confirmation
│   └── Preferences.tsx      # User preferences
│
├── services/          # API and external services
│   ├── api/              # TRPC API client
│   │   ├── index.ts         # API exports
│   │   ├── client.ts        # TRPC client setup
│   │   ├── types.ts          # Shared types
│   │   ├── auth.ts           # Auth API
│   │   ├── budgets.ts       # Budgets API
│   │   ├── categories.ts    # Categories API
│   │   ├── dashboard.ts     # Dashboard API
│   │   ├── investments.ts   # Investments API
│   │   ├── planner.ts       # Planner API
│   │   ├── plaid.ts        # Plaid API
│   │   └── transactions.ts  # Transactions API
│   │
│   └── auth.ts         # Authentication service
│
├── contexts/          # React contexts
│   └── AuthContext.tsx    # Auth state management
│
├── hooks/             # Custom React hooks
│   ├── useAuth.ts     # Authentication hook
│   └── useThemeSettings.ts  # Theme persistence (dark mode + accent color)
│
├── utils/             # Utility functions
│   ├── formatters.ts      # Number/currency formatting
│   └── validators.ts      # Form validators
│
├── App.tsx           # Root component
├── main.tsx          # Entry point
├── vite-env.d.ts     # Vite type declarations
└── index.css         # Global styles
```

## 🚀 Getting Started

### Installation

```bash
cd src/frontend
npm install
```

### Development

```bash
# Start development server
npm run dev

# Open in browser
# http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint

# Fix linting errors
npm run lint:fix
```

## 🎨 Theming

### Dark Mode

The app supports dark/light themes:

```typescript
// Toggle theme
const [darkMode, setDarkMode] = useState(true);
const toggleTheme = () => setDarkMode((prev) => !prev);

// Apply to root
<div className={darkMode ? 'dark' : ''}>
```

### Accent Color

Customizable accent color:

```typescript
const [accentColor, setAccentColor] = useState('#FF9900');

// Apply to elements
<button style={{ backgroundColor: accentColor }}>
```

### Theme Persistence (useThemeSettings)

The app includes a custom hook for persisting theme settings to localStorage:

```typescript
import { useThemeSettings } from '../hooks/useThemeSettings';

const { darkMode, toggleTheme, accentColor, setAccentColor } = useThemeSettings();
```

This automatically:
- Loads dark mode preference from localStorage on mount
- Saves dark mode to localStorage on change
- Loads accent color from localStorage on mount
- Saves accent color to localStorage on change

Keys used:
- `agentictrade_dark_mode` - Boolean stored as string
- `agentictrade_accent_color` - Hex color string

## 📡 API Integration

### TRPC Client

The app uses TRPC for type-safe API calls:

```typescript
// API service exports
import { apiService } from './services/api';

// Usage examples
const transactions = await apiService.getTransactions();
const budgets = await apiService.createBudget({ name: 'Food', amount: 500 });
```

### API Services

| Service | Methods | Description |
|---------|---------|-------------|
| `apiService.auth` | signIn, signUp, signOut, getCurrentUser | Authentication |
| `apiService.transactions` | get, create, update, delete, search | Transactions |
| `apiService.categories` | get, create, update, delete | Categories |
| `apiService.budgets` | get, create, update, delete, refresh | Budgets |
| `apiService.dashboard` | getDashboard, getCashflow, getNetWorth | Dashboard |
| `apiService.investments` | get, create, update, delete | Investments |
| `apiService.planner` | getPlans, createPlan, updatePlan | Planner |

## 🧩 Components

### Layout Components

#### Header (`components/layout/Header.tsx`)
Top navigation bar with:
- Theme toggle
- Accent color picker
- Settings button
- User profile

#### Sidebar (`components/layout/Sidebar.tsx`)
Left sidebar navigation:
- Dashboard
- Planner
- Investments
- Transactions
- Categories
- Budgets

### Budget Components

#### BudgetCard (`components/budgets/BudgetCard.tsx`)

```typescript
interface BudgetCardProps {
  budget: Budget;
  darkMode: boolean;
  accentColor: string;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  getProgressColor: (percentage: number) => string;
  categories: Category[];
}
```

Displays:
- Category name and color indicator
- Budget progress bar
- Spent vs budget amount
- Remaining amount

#### MonthlyBudgetPlanner (`components/budgets/MonthlyBudgetPlanner.tsx`)

Interactive grid for:
- Monthly budget planning
- Category × Month matrix
- Inline editing
- Bulk operations

#### CreateBudgetModal / EditBudgetModal
Modal dialogs for creating/editing budgets with:
- Month selection
- Category selection
- Amount input
- Validation

### Chart Components

Located in `components/charts/`:

| Component | Props | Description |
|-----------|-------|-------------|
| `AreaChart` | data, xKey, yKeys, colors | Area chart visualization |
| `BarChart` | data, xKey, yKeys, colors | Bar chart visualization |
| `DonutChart` | data, valueKey, labelKey, colors | Donut/pie chart |
| `LineChart` | data, xKey, yKeys, colors | Line chart visualization |

## 📱 Pages

### Dashboard (`pages/Dashboard.tsx`)

Main overview page with:
- Spending summary cards
- Monthly spending chart
- Category breakdown donut chart
- Recent transactions list
- Cashflow analysis

### Transactions (`pages/Transactions.tsx`)

Transaction management:
- List of all transactions
- Search functionality
- Filtering by date/category
- **Calendar View** - Visual calendar showing daily spending
- **Click day** - See transactions for that day
- **Click & drag** - Select date range with category breakdown
- Toggle between List and Calendar views

### Categories (`pages/Categories.tsx`)

Category management:
- Category list with colors
- Category totals and averages
- Create/edit categories
- Category assignment

### Budgets (`pages/Budgets.tsx`)

Budget tracking:
- Monthly budget cards
- Progress bars
- Budget vs actual spending
- Budget creation/editing
- **Active/Completed tabs** - Separate current/future months from past
- **Year grouping** - View budgets organized by year

### Investments (`pages/Investments.tsx`)

Investment portfolio:
- Investment list
- Performance metrics
- Holdings breakdown

### Planner (`pages/Planner.tsx`)

Savings goals:
- Goal cards with progress
- Milestone tracking
- Expense planning
- **Active/Completed tabs** - Separate current/future goals from past

## 🔐 Authentication

### Auth Context

```typescript
// Check auth status
const { user, isAuthenticated } = useAuth();

// Sign in
const { signIn } = useAuth();
await signIn({ email, password });

// Sign out
const { signOut } = useAuth();
await signOut();
```

### Protected Routes

Wrap routes that require authentication:

```typescript
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>
```

## 🎯 Type Definitions

### Core Types (`services/api/types.ts`)

```typescript
// Budget
interface Budget {
  id: string;
  name: string;
  budgetType: 'category' | 'total';
  categoryId?: string;
  amount: number;
  spent?: number;
  remaining?: number;
  percentage?: number;
  period: 'monthly';
  month?: number;
  year?: number;
}

// Transaction
interface Transaction {
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  date: string;
  name: string;
  merchantName?: string;
  categoryId?: string;
  category?: string;
  pending: boolean;
}

// Category
interface Category {
  id: string;
  name: string;
  color: string;
  description?: string;
  transactionCount: number;
  totalAmount: number;
  avgAmount: number;
  isDefault: boolean;
}
```

## 🧪 Testing

```bash
# Run tests (if configured)
npm test
npm test -- --coverage
```

## 📦 Build & Deploy

### Production Build

```bash
npm run build
```

Output in `dist/` directory.

### Environment Variables

```env
# TRPC API endpoint (set by CDK)
VITE_API_URL=https://api.agentictrade.app
```

### Deploy to S3

```bash
# Build
npm run build

# Deploy (requires CDK web stack)
cd ../cdk
npm run deploy:web
```

## 🛠️ Configuration

### Vite Config (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/trpc': 'http://localhost:4000',
    },
  },
});
```

### Tailwind Config (`tailwind.config.js`)

Custom colors and dark mode:

```javascript
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: '#FF9900',
      },
    },
  },
};
```

## 📱 Responsive Design

The app is fully responsive with breakpoints:
- `sm`: 640px and up
- `md`: 768px and up
- `lg`: 1024px and up
- `xl`: 1280px and up
- `2xl`: 1536px and up

## 🔄 State Management

### React Context

- `AuthContext` - Authentication state
- Theme state (local component state)

### Local Storage

Persisted preferences:
- Dark mode preference
- Accent color
- Collapsed sidebar state

## 📝 Style Guide

### Component Structure

```tsx
// 1. Imports
import { useState, useEffect } from 'react';
import { SomeIcon } from 'lucide-react';

// 2. Types/interfaces
interface ComponentProps {
  title: string;
  onClick: () => void;
}

// 3. Component
export default function Component({ title, onClick }: ComponentProps) {
  // Hooks
  const [state, setState] = useState();
  
  // Handlers
  const handleClick = () => { /* ... */ };
  
  // Render
  return (
    <div className="...">
      {children}
    </div>
  );
}
```

### CSS Classes

Using Tailwind CSS:
- Layout: `flex`, `grid`, `p-4`, `m-2`
- Typography: `text-xl`, `font-bold`, `text-gray-500`
- Colors: `bg-white`, `text-[#FF9900]`
- Dark mode: `dark:bg-gray-800`, `dark:text-white`

## 📚 Dependencies

### Core

- `react` - UI library
- `react-dom` - React DOM renderer
- `react-router-dom` - Routing

### State & Data

- `@trpc/client` - TRPC client
- `@tanstack/react-query` - Data fetching (optional)

### UI & Styling

- `tailwindcss` - Utility CSS
- `lucide-react` - Icons
- `clsx` - Class names utility
- `tailwind-merge` - Tailwind merge utility

### Forms

- `react-hook-form` - Form handling
- `zod` - Validation schemas

## 🐛 Troubleshooting

### HMR Not Working

```bash
# Restart development server
npm run dev
```

### Build Errors

```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run build
```

### TypeScript Errors

```bash
# Type-check
npx tsc --noEmit
```

## 📄 License

MIT License - see parent project LICENSE file.
