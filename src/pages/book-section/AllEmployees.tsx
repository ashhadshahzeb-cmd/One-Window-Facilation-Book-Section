import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Search, Eye, Users, FileText, Download, Wallet, ArrowUpDown, ChevronLeft, ChevronRight, X, Info } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

// Format dates nicely
const formatDateDisplay = (dateStr: string | null) => {
  if (!dateStr) return "---";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Map subcategory values to readable labels
const getSubCatLabel = (val: string | null) => {
  if (!val) return "---";
  const mapping: Record<string, string> = {
    'cp-fund': 'CP Fund',
    'funds': 'Funds',
    'supp-salary': 'Supp Salary',
    'house-building': 'House Building',
    'tada': 'TADA',
    'overtime': 'Overtime',
    'fund': 'Fund',
    'lpr': 'LPR',
    'pension-gratuity': 'Pension Gratuity',
    'pension-arrear': 'Pension Arrear',
    'financial-assistance': 'Financial Assistance'
  };
  return mapping[val] || val;
};

export default function AllEmployees() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedViewRecord, setSelectedViewRecord] = useState<any>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    totalAmount: 0,
    totalRecords: 0,
    regularCount: 0,
    retiredCount: 0
  });

  // Fetch stats from database
  const fetchStats = async () => {
    try {
      // Try to call the RPC function to get full aggregate stats across all rows
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_book_section_stats');

      if (!rpcError && rpcData) {
        setStats({
          totalAmount: Number(rpcData.total_amount) || 0,
          totalRecords: Number(rpcData.total_count) || 0,
          regularCount: Number(rpcData.regular_count) || 0,
          retiredCount: Number(rpcData.retired_count) || 0
        });
        return;
      }

      console.warn("RPC stats failed, falling back to basic query (limited to 1,000 rows):", rpcError?.message);

      // Fallback: Fetch counts and amounts (limited to first 1000 records)
      const { data, error } = await supabase
        .from('book_section_employees')
        .select('total_amount, category');

      if (error) throw error;

      if (data) {
        const totalAmt = data.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
        const regular = data.filter(r => r.category === 'Employed').length;
        const retired = data.filter(r => r.category === 'Retired').length;

        setStats({
          totalAmount: totalAmt,
          totalRecords: data.length,
          regularCount: regular,
          retiredCount: retired
        });
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  // Fetch paginated and filtered records
  const fetchRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('book_section_employees')
        .select('*', { count: 'exact' });

      // Apply search filters
      if (searchTerm.trim() !== "") {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`employee_no.ilike.${term},pension_no.ilike.${term},full_name.ilike.${term},cnic_no.ilike.${term}`);
      }

      // Filter by Source Tab
      if (selectedTab !== "ALL") {
        query = query.eq('source_tab', selectedTab);
      }

      // Filter by Category
      if (selectedCategory !== "ALL") {
        query = query.eq('category', selectedCategory);
      }

      // Order and Paginate
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(start, end);

      if (error) throw error;

      setRecords(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error("Error fetching database records:", err);
      toast.error("Failed to load records: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset page on filter change
    fetchRecords();
  }, [searchTerm, selectedTab, selectedCategory, pageSize]);

  useEffect(() => {
    fetchRecords();
  }, [currentPage]);

  // Export search results to CSV
  const handleExportCSV = async () => {
    try {
      toast.info("Preparing data for export...");
      let query = supabase.from('book_section_employees').select('*');

      if (searchTerm.trim() !== "") {
        const term = `%${searchTerm.trim()}%`;
        query = query.or(`employee_no.ilike.${term},pension_no.ilike.${term},full_name.ilike.${term},cnic_no.ilike.${term}`);
      }
      if (selectedTab !== "ALL") query = query.eq('source_tab', selectedTab);
      if (selectedCategory !== "ALL") query = query.eq('category', selectedCategory);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.warning("No records found to export.");
        return;
      }

      // Create CSV Headers and Rows
      const headers = [
        "Serial No", "Employee No", "Pension No", "Full Name", "CNIC No", 
        "Category", "Sub-Category", "Source Tab", "Nature of Bill", 
        "Cheque No", "Cheque Date", "Total Amount", "Paid Amount", 
        "Deduction", "Passing Date", "Bank Status"
      ];

      const csvRows = [
        headers.join(","),
        ...data.map(r => [
          `"${r.serial_no || ''}"`,
          `"${r.employee_no || ''}"`,
          `"${r.pension_no || ''}"`,
          `"${r.full_name?.replace(/"/g, '""') || ''}"`,
          `"${r.cnic_no || ''}"`,
          `"${r.category || ''}"`,
          `"${r.sub_category_regular || r.sub_category_retired || ''}"`,
          `"${r.source_tab || ''}"`,
          `"${r.nature_of_bill?.replace(/"/g, '""') || ''}"`,
          `"${r.cheque_no || ''}"`,
          `"${r.cheque_date || ''}"`,
          r.total_amount || 0,
          r.paid_amount || 0,
          r.deduction || 0,
          `"${r.passing_date || ''}"`,
          `"${r.bank_status || ''}"`
        ].join(","))
      ];

      const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `employee_records_search_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Exported ${data.length} records to CSV!`);
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Tab Badge colors helper
  const getTabBadgeColor = (tabName: string) => {
    if (!tabName) return "bg-gray-500/20 text-gray-400";
    const t = tabName.toUpperCase();
    if (t.includes("CP.FUND") || t.includes("F.C")) return "bg-blue-500/20 text-blue-400";
    if (t.includes("L.P.R") || t.includes("H.B.L") || t.includes("M.M.L")) return "bg-amber-500/20 text-amber-400";
    if (t.includes("PEN")) return "bg-purple-500/20 text-purple-400";
    if (t.includes("DISBURSEMENT") || t.includes("DISB")) return "bg-emerald-500/20 text-emerald-400";
    if (t.includes("SALARY")) return "bg-pink-500/20 text-pink-400";
    if (t.includes("T.A.D.A") || t.includes("O.T")) return "bg-sky-500/20 text-sky-400";
    if (t.includes("F.A") || t.includes("G.I") || t.includes("MED") || t.includes("HINDO")) return "bg-rose-500/20 text-rose-400";
    return "bg-indigo-500/20 text-indigo-400";
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10 font-sans">
      
      {/* Header and Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unified Employee Database</h1>
          <p className="text-sm text-muted-foreground/80">Browse, search, filter and inspect claims history across all departments</p>
        </div>
        <Button onClick={handleExportCSV} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
          <Download className="w-4 h-4" /> Export Search Results
        </Button>
      </div>

      {/* Stats Counters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card border-none shadow-md overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Database Records</span>
              <h3 className="text-2xl font-bold font-mono tracking-tight text-white">{stats.totalRecords.toLocaleString()}</h3>
            </div>
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-none shadow-md overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Sanctioned Amount</span>
              <h3 className="text-2xl font-bold font-mono tracking-tight text-emerald-400">Rs. {stats.totalAmount.toLocaleString()}</h3>
            </div>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
              <Wallet className="w-6 h-6 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-none shadow-md overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Regular Staff Records</span>
              <h3 className="text-2xl font-bold font-mono tracking-tight text-blue-400">{stats.regularCount.toLocaleString()}</h3>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-none shadow-md overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Retired Staff Records</span>
              <h3 className="text-2xl font-bold font-mono tracking-tight text-purple-400">{stats.retiredCount.toLocaleString()}</h3>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Panel */}
      <Card className="glass-card border-none shadow-md">
        <div className="h-1 bg-indigo-500/30" />
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* General Search Input */}
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs font-bold uppercase tracking-tight text-indigo-400">Search Profile</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Enter Employee No, Pension No, CNIC, or Full Name..." 
                  className="pl-9 h-11 bg-background/50 border-border/50 text-sm focus-visible:ring-indigo-500" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-tight text-blue-400">Staff Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-11 bg-background/50 border-border/50">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  <SelectItem value="Employed">Regular Staff (Employed)</SelectItem>
                  <SelectItem value="Retired">Retired Staff (Pension)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source Tab Filter */}
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-tight text-purple-400">Source Sheet / Tab</Label>
              <Select value={selectedTab} onValueChange={setSelectedTab}>
                <SelectTrigger className="h-11 bg-background/50 border-border/50 font-medium">
                  <SelectValue placeholder="All GIDs/Tabs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sheets & Tabs</SelectItem>
                  <SelectItem value="CP.FUND">CP Fund (CP.FUND)</SelectItem>
                  <SelectItem value="L.P.R">LPR (L.P.R)</SelectItem>
                  <SelectItem value="PEN">Pension (PEN)</SelectItem>
                  <SelectItem value="F.A">Financial Assistance (F.A)</SelectItem>
                  <SelectItem value="G.I">Group Insurance (G.I)</SelectItem>
                  <SelectItem value="F.C">Funds / CP Fund (F.C)</SelectItem>
                  <SelectItem value="S.SALARY">Supplementary Salary (S.SALARY)</SelectItem>
                  <SelectItem value="C.SALARY">Contract Salary (C.SALARY)</SelectItem>
                  <SelectItem value="T.A.D.A">TADA (T.A.D.A)</SelectItem>
                  <SelectItem value="O.T">Overtime (O.T)</SelectItem>
                  <SelectItem value="H.B.L">House Building Loan (H.B.L)</SelectItem>
                  <SelectItem value="M.M.L">Motorcycle Loan (M.M.L)</SelectItem>
                  <SelectItem value="MED">Medical Claim (MED)</SelectItem>
                  <SelectItem value="HINDO FESTIVAL">Hindu Festival (HINDO FESTIVAL)</SelectItem>
                  <SelectItem value="DISBURSEMENTS">Disbursements (DISBURSEMENTS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Main Table Card */}
      <Card className="glass-card border-none shadow-md overflow-hidden">
        <div className="h-2 bg-indigo-500" />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40 border-b border-border/50">
                <TableRow>
                  <TableHead className="pl-6 uppercase text-[10px] font-bold">Source/Tab</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold">Emp/Pen No</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold">Full Name</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold">Sub-Category</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold">Nature of Bill</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold text-emerald-400">Total Amount</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold text-center">Passing/Payment Date</TableHead>
                  <TableHead className="uppercase text-[10px] font-bold">Cheque No</TableHead>
                  <TableHead className="text-right pr-6 uppercase text-[10px] font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-20">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <span className="text-xs text-muted-foreground/80 font-bold uppercase tracking-widest">Querying Unified Database...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : records.length > 0 ? (
                  records.map((r, idx) => {
                    const dateToShow = r.passing_date || r.payment_date || r.disbursed_date;
                    const amountToShow = r.total_amount || r.cheque_amount || r.total_disbursement;

                    return (
                      <TableRow key={r.id || idx} className="hover:bg-white/5 transition-colors border-b border-white/5">
                        <TableCell className="pl-6">
                          <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tighter ${getTabBadgeColor(r.source_tab)}`}>
                            {r.source_tab || "UNIFIED"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-white/80">
                          {r.employee_no || r.pension_no || "---"}
                        </TableCell>
                        <TableCell className="font-semibold text-xs text-white max-w-[150px] truncate" title={r.full_name}>
                          {r.full_name}
                        </TableCell>
                        <TableCell className="text-xs">
                          {getSubCatLabel(r.sub_category_regular || r.sub_category_retired)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate" title={r.nature_of_bill || r.bank_details || "N/A"}>
                          {r.nature_of_bill || r.bank_details || "---"}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-emerald-400">
                          Rs. {amountToShow?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {formatDateDisplay(dateToShow)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.cheque_no || "---"}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedViewRecord(r)}>
                            <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-20 text-muted-foreground italic text-sm">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Info className="w-8 h-8 text-muted-foreground/30" />
                        <span>No records match your filters or database is currently empty</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-t border-white/5 bg-muted/10">
              <span className="text-xs text-muted-foreground">
                Showing <strong className="text-white">{(currentPage - 1) * pageSize + 1}</strong> to{" "}
                <strong className="text-white">{Math.min(currentPage * pageSize, totalCount)}</strong> of{" "}
                <strong className="text-white">{totalCount}</strong> records
              </span>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Button>
                
                <span className="text-xs text-muted-foreground font-mono">
                  Page <strong className="text-white">{currentPage}</strong> of {totalPages}
                </span>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Detailed Record Dialog */}
      <Dialog open={!!selectedViewRecord} onOpenChange={(open) => !open && setSelectedViewRecord(null)}>
        <DialogContent className="sm:max-w-3xl bg-card border-none glass-card shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-white/5 pb-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-3 font-heading">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                 <Users className="w-6 h-6 text-primary" />
              </div>
              Record details # {selectedViewRecord?.serial_no || "Auto"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 p-4">
            <div className="space-y-4">
               <div className="w-full aspect-square rounded-xl border border-white/10 overflow-hidden bg-white/5">
                  {selectedViewRecord?.photo_url ? (
                    <img src={selectedViewRecord.photo_url} alt="Staff" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-2 text-muted-foreground/40">
                       <Users className="w-12 h-12" />
                       <span className="text-[10px] font-bold uppercase tracking-widest">No Profile Photo</span>
                    </div>
                  )}
               </div>
               <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <span className="text-[10px] uppercase font-bold text-primary/60 block mb-1">Categorization</span>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-black/40 rounded text-[10px] font-bold uppercase">{selectedViewRecord?.category}</span>
                    <span className="px-2 py-0.5 bg-black/40 rounded text-[10px] font-bold uppercase">
                      {getSubCatLabel(selectedViewRecord?.sub_category_regular || selectedViewRecord?.sub_category_retired)}
                    </span>
                  </div>
               </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5 text-xs">
                  <span className="text-muted-foreground font-medium uppercase tracking-tighter">Staff Name</span>
                  <p className="font-bold text-base truncate">{selectedViewRecord?.full_name}</p>
                </div>
                <div className="space-y-0.5 text-xs">
                  <span className="text-muted-foreground font-medium uppercase tracking-tighter">CNIC Number</span>
                  <p className="font-mono font-bold">{selectedViewRecord?.cnic_no || "---"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                <div>
                   <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Employee No</span>
                   <p className="font-bold font-mono">{selectedViewRecord?.employee_no || "N/A"}</p>
                </div>
                <div>
                   <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Pension No</span>
                   <p className="font-bold font-mono">{selectedViewRecord?.pension_no || "N/A"}</p>
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Bank Account / Payment Record</span>
                <p className="font-semibold text-blue-400 bg-blue-500/5 p-2 rounded border border-blue-500/10 text-xs italic">{selectedViewRecord?.bank_details || "No details provided"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                 <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Appointment Date</span>
                    <p className="font-bold font-mono text-xs">{selectedViewRecord?.appointment_date || "N/A"}</p>
                 </div>
                 <div>
                    <span className="text-[10px] uppercase font-bold text-rose-500 opacity-60">Retired Date</span>
                    <p className="font-bold font-mono text-xs">{selectedViewRecord?.retired_date || "N/A"}</p>
                 </div>
              </div>

              {selectedViewRecord?.source_tab && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Source Sheet/Tab</span>
                      <p className="font-bold text-indigo-400 uppercase text-xs">{selectedViewRecord?.source_tab}</p>
                   </div>
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Nature of Bill</span>
                      <p className="font-bold text-xs">{selectedViewRecord?.nature_of_bill || "---"}</p>
                   </div>
                </div>
              )}

              {selectedViewRecord?.cheque_no && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Cheque Number</span>
                      <p className="font-mono font-bold text-blue-400">{selectedViewRecord?.cheque_no}</p>
                   </div>
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Cheque Date</span>
                      <p className="font-mono">{selectedViewRecord?.cheque_date || "---"}</p>
                   </div>
                </div>
              )}

              {(selectedViewRecord?.pmr_no || selectedViewRecord?.pmr_date || selectedViewRecord?.cheque_break_up) && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">PMR Number</span>
                      <p className="font-mono font-bold text-xs">{selectedViewRecord?.pmr_no || "---"}</p>
                   </div>
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">PMR Date</span>
                      <p className="font-mono text-xs">{selectedViewRecord?.pmr_date || "---"}</p>
                   </div>
                   <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Cheque Break-up</span>
                      <p className="font-mono text-xs truncate" title={selectedViewRecord?.cheque_break_up}>{selectedViewRecord?.cheque_break_up || "---"}</p>
                   </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                 <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Passing Date</span>
                    <p className="font-mono text-xs">{selectedViewRecord?.passing_date || "---"}</p>
                 </div>
                 <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Entry Date</span>
                    <p className="font-mono text-xs">{selectedViewRecord?.entry_date || "---"}</p>
                 </div>
                 <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Payment Date</span>
                    <p className="font-mono text-xs">{selectedViewRecord?.payment_date || "---"}</p>
                 </div>
              </div>

              {(selectedViewRecord?.paid_amount > 0 || selectedViewRecord?.deduction > 0) && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5 font-mono">
                   <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-500 opacity-60">Paid Amount</span>
                      <p className="font-bold text-emerald-400">Rs.{selectedViewRecord?.paid_amount?.toLocaleString()}</p>
                   </div>
                   <div>
                      <span className="text-[10px] uppercase font-bold text-rose-500 opacity-60">Deduction</span>
                      <p className="font-bold text-rose-400">Rs.{selectedViewRecord?.deduction?.toLocaleString()}</p>
                   </div>
                </div>
              )}

              <div className="space-y-1 pt-2 border-t border-white/5">
                 <div className="flex justify-between items-end">
                    <div>
                       <span className="text-[10px] uppercase font-bold text-emerald-500">Total Approved</span>
                       <p className="text-xl font-bold font-mono">Rs.{selectedViewRecord?.total_amount?.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] uppercase font-bold text-rose-500">Net Payable</span>
                       <p className="text-lg font-bold font-mono">Rs.{selectedViewRecord?.cheque_amount?.toLocaleString()}</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Disbursement Breakdown Panel */}
          {(selectedViewRecord?.total_disbursement > 0 || 
            selectedViewRecord?.fund_amount > 0 || 
            selectedViewRecord?.sal_amount > 0 || 
            selectedViewRecord?.pen_amount > 0 || 
            selectedViewRecord?.lpr_amount > 0 || 
            selectedViewRecord?.disb_amount > 0 || 
            selectedViewRecord?.med_amount > 0 || 
            selectedViewRecord?.gins_amount > 0 || 
            selectedViewRecord?.other_amount > 0 ||
            selectedViewRecord?.ref_care_of || 
            selectedViewRecord?.bank_status) && (
            <div className="border-t border-white/5 p-4 space-y-3 bg-emerald-500/5 rounded-b-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Disbursement & Fund Breakdown
              </span>
              
              {selectedViewRecord?.ref_care_of && (
                <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/20 text-xs flex justify-between items-center">
                  <span className="text-muted-foreground">Reference / Care of:</span>
                  <span className="font-semibold text-white">{selectedViewRecord.ref_care_of}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {selectedViewRecord?.fund_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Fund Amount</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.fund_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.sal_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Salary Amount</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.sal_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.pen_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Pension Amount</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.pen_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.lpr_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">LPR Amount</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.lpr_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.disb_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Disbursed Amount</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.disb_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.med_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Medical Claim</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.med_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.gins_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Group Insurance</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.gins_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedViewRecord?.other_amount > 0 && (
                  <div className="p-2 bg-black/30 rounded border border-white/10">
                    <span className="text-[9px] uppercase font-medium text-muted-foreground block">Other Amount</span>
                    <span className="font-mono font-bold text-white">Rs. {selectedViewRecord.other_amount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {(selectedViewRecord?.total_disbursement > 0 || selectedViewRecord?.bank_status) && (
                <div className="flex justify-between items-center p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Bank Status:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      selectedViewRecord.bank_status?.toUpperCase() === 'PAID' || selectedViewRecord.bank_status?.toUpperCase() === 'CLOSE' 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {selectedViewRecord.bank_status || "PENDING"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">Total Disbursement</span>
                    <span className="text-sm font-bold font-mono text-white">Rs. {selectedViewRecord.total_disbursement.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
