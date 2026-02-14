'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, FileText, Activity, Server, HardDrive, Globe, Info } from 'lucide-react';

interface SyncStatus {
    name: string;
    type: 'local' | 'live';
    path?: string;
    url?: string;
    exists: boolean;
    lastModified?: string;
    lastModifiedLocale?: string;
    error?: string;
    delaySeconds?: number | null;
}

export default function SystemStatus() {
    const [statuses, setStatuses] = useState<SyncStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/system-status');
            const data = await res.json();
            if (data.statuses) setStatuses(data.statuses);
            setLastChecked(new Date());
        } catch (error) {
            console.error('Failed to fetch status:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const localStatuses = statuses.filter(s => s.type === 'local');
    // Group live statuses: calendar-api, panel, takvim
    const liveStatuses = statuses.filter(s => s.type === 'live');

    const StatusTable = ({ items, title, icon: Icon }: { items: SyncStatus[], title: string, icon: any }) => (
        <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50 flex items-center gap-2">
                <Icon className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-slate-200">{title}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-700 text-slate-400 text-sm">
                            <th className="px-6 py-3 font-medium">Proje / Modül</th>
                            <th className="px-6 py-3 font-medium">Hedef</th>
                            <th className="px-6 py-3 font-medium">Son Güncelleme</th>
                            <th className="px-6 py-3 font-medium">Gecikme (Delay)</th>
                            <th className="px-6 py-3 font-medium">Durum</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {items.map((status, idx) => {
                            let delayColor = 'text-slate-400';
                            let delayText = '-';

                            if (status.delaySeconds !== undefined && status.delaySeconds !== null && status.exists) {
                                const sec = status.delaySeconds;
                                if (sec < 60) {
                                    delayColor = 'text-emerald-400 font-bold';
                                    delayText = `${sec} sn`;
                                } else if (sec < 300) { // 5 mins = 300s
                                    delayColor = 'text-orange-400 font-bold';
                                    delayText = `${Math.floor(sec / 60)} dk ${sec % 60} sn`;
                                } else {
                                    delayColor = 'text-rose-500 font-bold';
                                    delayText = `${Math.floor(sec / 60)} dk`;
                                }
                            }

                            return (
                                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-200">
                                        {status.name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 text-sm font-mono truncate max-w-xs" title={status.path || status.url}>
                                        {status.type === 'local' ? (
                                            <span className="flex items-center gap-2"><HardDrive className="w-3 h-3 text-slate-600" /> ...{status.path?.slice(-30)}</span>
                                        ) : (
                                            <span className="flex items-center gap-2 text-blue-400"><Globe className="w-3 h-3" /> {status.url?.replace('https://', '')}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 font-mono text-sm">
                                        {status.lastModifiedLocale || '-'}
                                    </td>
                                    <td className={`px-6 py-4 font-mono text-sm ${delayColor}`}>
                                        {delayText}
                                    </td>
                                    <td className="px-6 py-4">
                                        {status.exists ? (
                                            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full w-fit text-xs font-medium border border-emerald-400/20">
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                AKTİF
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-rose-400 bg-rose-400/10 px-3 py-1 rounded-full w-fit text-xs font-medium border border-rose-400/20" title={status.error}>
                                                <XCircle className="w-3.5 h-3.5" />
                                                {status.type === 'live' ? 'ERİŞİLEMEDİ' : 'BULUNAMADI'}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const RuleCard = ({ title, color, rules }: { title: string, color: string, rules: string[] }) => (
        <div className={`p-5 rounded-xl border ${color} bg-slate-800/80 backdrop-blur-sm shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300`}>
            <div className={`absolute top-0 left-0 w-1 h-full ${color.replace('border-', 'bg-').replace('/30', '/80')}`}></div>
            <h4 className="font-bold text-lg text-slate-100 mb-3 flex items-center gap-2">
                {title}
            </h4>
            <ul className="space-y-2">
                {rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-400">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-500 flex-shrink-0"></span>
                        <span>{rule}</span>
                    </li>
                ))}
            </ul>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 p-6 sm:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Activity className="w-7 h-7 text-indigo-500" />
                            Sistem Durumu Merkezi
                        </h2>
                        <p className="text-slate-400 mt-1">
                            Tüm projelerdeki senkronizasyon ve deploy durumu.
                        </p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                        {lastChecked && <div className="text-xs text-slate-500 hidden sm:block">Son: {lastChecked.toLocaleTimeString()}</div>}
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Yenileniyor...' : 'Durumu Güncelle'}
                        </button>
                    </div>
                </div>

                {/* Status Tables */}
                <StatusTable items={localStatuses} title="Yerel Dosya Sistemi (Local Sync)" icon={HardDrive} />
                <StatusTable items={liveStatuses} title="Canlı Sunucular (Live Deployments)" icon={Globe} />

                {/* Rules Visualization */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <FileText className="w-6 h-6 text-indigo-400" />
                        <h3 className="text-xl font-bold text-slate-200">Aktif Sınıflandırma Kuralları</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">v1.2 Automated</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* SURGERY */}
                        <RuleCard
                            title="🔪 AMELİYAT (Surgery)"
                            color="border-rose-500/30"
                            rules={[
                                "Süre en az 45 dakika olmalı.",
                                "Başlıkta '🔪' emojisi geçiyorsa.",
                                "Başlıkta 'ameliyat' veya 'surgery' kelimesi geçiyorsa.",
                                "Saat ile başlıyorsa (örn: 08:00) ve içinde 'muayene' yoksa."
                            ]}
                        />

                        {/* CHECKUP */}
                        <RuleCard
                            title="🔍 KONTROL (Checkup)"
                            color="border-sky-500/30"
                            rules={[
                                "'k', 'k1', 'k2' ile başlıyorsa.",
                                "'1m ', '3m ', '1.5m ' (ay kontrolü) formatındaysa.",
                                "Başlık içinde açıkça 'kontrol' kelimesi geçiyorsa."
                            ]}
                        />

                        {/* BLOCKED */}
                        <RuleCard
                            title="⛔ BLOCKED (Meşgul)"
                            color="border-amber-500/30"
                            rules={[
                                "ÖNCELİKLİ KURAL: Renk ne olursa olsun bu kelimeler varsa engellenir.",
                                "Kelimeler: xxx, izin, kongre, toplantı, off, yokum, cumartesi, pazar.",
                                "Listelere dahil edilmez, takvimi meşgul olarak işaretler."
                            ]}
                        />

                        {/* IGNORE */}
                        <RuleCard
                            title="👻 IGNORE (Gözardı)"
                            color="border-slate-500/30"
                            rules={[
                                "Etkinlik rengi KIRMIZI (Flamingo) ise.",
                                "'ipt', 'ert', 'bilgi', 'ℹ️' ile başlıyorsa.",
                                "Sisteme hiç dahil edilmez, yok sayılır."
                            ]}
                        />
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-start gap-3 mt-4">
                        <Info className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div className="text-sm text-slate-400">
                            <strong>Not:</strong> Tüm kurallar büyük/küçük harf duyarsızdır ve Türkçe karakter eşleşmesi otomatik yapılır (İ=i, Ş=s). Varsayılan olarak yukarıdaki kategorilere girmeyen her şey <strong>RANDEVU (Appointment)</strong> olarak kabul edilir.
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
