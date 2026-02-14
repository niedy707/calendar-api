"use client";

import React, { useState, useEffect } from "react";
import { Search, User, Calendar, Hospital, Info, Loader2, RefreshCw } from "lucide-react";

interface Control {
    date: string;
    status: 'attended' | 'cancelled' | 'planned';
    title: string;
    label: string;
}

interface Patient {
    name: string;
    surgeryDate: string;
    hospital?: string;
    controls?: Control[];
}

const HOSPITALS = [
    { id: "BHT", name: "BHT", icon: "🏥" },
    { id: "Asya", name: "Asya", icon: "🏢" },
    { id: "Bağcılar", name: "Bağcılar", icon: "🏛️" },
    { id: "ICH", name: "ICH", icon: "🏢" },
    { id: "Medistanbul", name: "Medistanbul", icon: "🏥" },
    { id: "Hepsi", name: "Hepsi", icon: "🌎" },
];

export default function PatientDatabase() {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeHospital, setActiveHospital] = useState("BHT");
    const [searchQuery, setSearchQuery] = useState("");

    const fetchPatients = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/patient-db");
            if (response.ok) {
                const data = await response.json();
                setPatients(data);
            }
        } catch (error) {
            console.error("Error fetching patients:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPatients();
    }, []);

    const filteredPatients = patients.filter((p) => {
        const matchesHospital = activeHospital === "Hepsi" || p.hospital === activeHospital;
        const nameStr = (p.name || "").toLowerCase();
        const queryStr = searchQuery.toLowerCase();
        const dateStr = p.surgeryDate || "";

        const matchesSearch = nameStr.includes(queryStr) || dateStr.includes(queryStr);
        return matchesHospital && matchesSearch;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'cancelled': return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
            case 'attended': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
            case 'planned': return 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30';
            default: return 'bg-slate-700/50 border-slate-600 text-slate-400';
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-8 font-sans pb-32">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                <div className="relative z-10 space-y-2">
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <User className="w-8 h-8 text-indigo-500" />
                        Hasta Takip Sistemi
                    </h1>
                    <p className="text-slate-400 font-medium">
                        Calendar API Entegrasyonu & Veritabanı
                    </p>
                </div>

                <button
                    onClick={fetchPatients}
                    disabled={loading}
                    className="relative z-10 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Yükleniyor...' : 'Verileri Güncelle'}
                </button>
            </div>

            {/* Search and Filters */}
            <div className="space-y-6">
                {/* Search Bar */}
                <div className="relative group max-w-3xl mx-auto">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                        <Search className="w-6 h-6 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Hasta adı veya ameliyat tarihi ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all text-slate-100 text-lg shadow-lg placeholder:text-slate-600"
                    />
                </div>

                {/* Hospital Tabs */}
                <div className="flex flex-wrap gap-2 justify-center">
                    {HOSPITALS.map((h) => (
                        <button
                            key={h.id}
                            onClick={() => setActiveHospital(h.id)}
                            className={`px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all border ${activeHospital === h.id
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/50"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-800"
                                }`}
                        >
                            <span className="text-base op">{h.icon}</span>
                            {h.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Patient List Grid */}
            <div className="grid grid-cols-1 gap-4">
                {loading && filteredPatients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                        </div>
                        <p className="text-slate-500 font-medium animate-pulse">Veriler yükleniyor...</p>
                    </div>
                ) : filteredPatients.length > 0 ? (
                    filteredPatients.map((p, idx) => (
                        <div
                            key={idx}
                            className="group relative bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-indigo-500/50 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-indigo-900/10"
                        >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-start md:items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors border border-slate-700 group-hover:border-indigo-500/30 shrink-0">
                                        <User className="w-7 h-7" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <h3 className="text-xl font-bold text-slate-200 group-hover:text-white transition-colors">
                                            {p.name}
                                        </h3>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                                                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                                {p.surgeryDate}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-bold uppercase tracking-wider bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                                                <Hospital className="w-3.5 h-3.5" />
                                                {p.hospital || 'Bilinmiyor'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Controls Section */}
                                <div className="flex flex-col md:items-end gap-2.5 pl-14 md:pl-0">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Kontroller Durumu
                                    </span>
                                    <div className="flex flex-wrap gap-2 md:justify-end">
                                        {p.controls && p.controls.length > 0 ? (
                                            p.controls.map((c, cIdx) => (
                                                <div
                                                    key={cIdx}
                                                    title={`${c.date} - ${c.title}`}
                                                    className={`h-8 px-3 rounded-lg flex items-center justify-center cursor-help text-xs font-bold transition-all hover:scale-105 ${getStatusColor(c.status)}`}
                                                >
                                                    {c.label}
                                                </div>
                                            ))
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 text-xs">
                                                <Info className="w-3 h-3" />
                                                Kontrol yok
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-20 bg-slate-900 rounded-3xl border border-dashed border-slate-800">
                        <User className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">Kriterlere uygun kayıt bulunamadı</p>
                    </div>
                )}
            </div>
        </div>
    );
}
