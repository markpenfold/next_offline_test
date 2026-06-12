"use client"

import { useEffect, useState } from 'react';
import { DuckDBManager } from '@/components/data/manager';

export function DuckData() {

    const db = DuckDBManager.getInstance();

    return (
        <div>Yo!</div>
    );
}