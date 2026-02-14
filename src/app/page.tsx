'use client';

import React, { useState } from 'react';
import PatientDatabase from '@/components/PatientDatabase';
import SystemStatus from '@/components/SystemStatus';
import { Users, Activity } from 'lucide-react';

export default function Home() {
    const [activeTab, setActiveTab] = useState<'patients' | 'status'>('patients');

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100">
            {/* Top Navigation Bar */}
            <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex">
                            <div className="flex-shrink-0 flex items-center mr-8">
                                <span className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                                    Calendar API
                                </span>
                            </div>
                            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                                <button
                                    onClick={() => setActiveTab('patients')}
                                    className={`${activeTab === 'patients'
                                            ? 'border-indigo-500 text-white'
                                            : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200`}
                                >
                                    <Users className="w-4 h-4 mr-2" />
                                    Hasta Listesi
                                </button>
                                <button
                                    onClick={() => setActiveTab('status')}
                                    className={`${activeTab === 'status'
                                            ? 'border-indigo-500 text-white'
                                            : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200`}
                                >
                                    <Activity className="w-4 h-4 mr-2" />
                                    Sistem Durumu
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="py-6">
                {activeTab === 'patients' ? <PatientDatabase /> : <SystemStatus />}
            </div>
        </main>
    );
}
