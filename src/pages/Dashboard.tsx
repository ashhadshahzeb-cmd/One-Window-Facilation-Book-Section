import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { bankAccounts, transactions, monthlyData, formatCurrency } from "@/lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";

const totalBalance = bankAccounts.reduce((s, b) => s + (b.currency === 'PKR' ? b.balance : b.balance * 280), 0);
const totalIncome = 2775000;
const totalExpenses = 1450800;
const pendingCount = transactions.filter(t => t.status === 'pending').length;

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Financial overview across all accounts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Balance"
          value={formatCurrency(totalBalance)}
          icon={Wallet}
          trend={{ value: "8.2% from last month", positive: true }}
          glow
        />
        <StatCard
          title="Monthly Income"
          value={formatCurrency(totalIncome)}
          icon={TrendingUp}
          trend={{ value: "12.4%", positive: true }}
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(totalExpenses)}
          icon={TrendingDown}
          trend={{ value: "3.1%", positive: false }}
        />
        <StatCard
          title="Pending Approvals"
          value={String(pendingCount)}
          subtitle="transactions awaiting review"
          icon={Clock}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Income vs Expenses */}
        <div className="lg:col-span-2 glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Income vs Expenses</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(215 15% 50%)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(215 15% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{ background: 'hsl(222 25% 12%)', border: '1px solid hsl(222 20% 18%)', borderRadius: 8, color: 'hsl(210 20% 90%)' }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Bar dataKey="income" fill="hsl(152 69% 42%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bank Balances */}
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Bank Accounts</h3>
          <div className="space-y-3">
            {bankAccounts.map((bank) => (
              <div key={bank.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full" style={{ backgroundColor: bank.color }} />
                  <div>
                    <p className="text-sm font-medium">{bank.bankName}</p>
                    <p className="text-xs text-muted-foreground">{bank.maskedNumber}</p>
                  </div>
                </div>
                <p className="text-sm font-mono font-medium">
                  {formatCurrency(bank.balance, bank.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="glass-card p-5 animate-fade-in">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Monthly Cash Flow</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={monthlyData.map(m => ({ ...m, net: m.income - m.expenses }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 16%)" />
            <XAxis dataKey="month" tick={{ fill: 'hsl(215 15% 50%)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(215 15% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
            <Tooltip contentStyle={{ background: 'hsl(222 25% 12%)', border: '1px solid hsl(222 20% 18%)', borderRadius: 8, color: 'hsl(210 20% 90%)' }} formatter={(v: number) => formatCurrency(v)} />
            <Area type="monotone" dataKey="net" stroke="hsl(174 72% 46%)" fill="hsl(174 72% 46% / 0.1)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Transactions */}
      <div className="glass-card p-5 animate-fade-in">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">Bank</th>
                <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground">Amount</th>
                <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 8).map((t) => (
                <tr key={t.id} className="border-b border-border/50 table-row-hover transition-colors">
                  <td className="py-3 px-2 font-mono text-xs text-muted-foreground">{t.date}</td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      {t.type === 'credit' ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-income shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-expense shrink-0" />
                      )}
                      {t.description}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-muted-foreground">{t.bankName}</td>
                  <td className={cn("py-3 px-2 text-right font-mono font-medium", t.type === 'credit' ? "text-income" : "text-expense")}>
                    {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full font-medium",
                      t.status === 'reconciled' && "bg-primary/10 text-primary",
                      t.status === 'approved' && "bg-success/10 text-income",
                      t.status === 'pending' && "bg-warning/10 text-warning",
                    )}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
