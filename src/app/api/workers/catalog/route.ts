import { listWorkerCatalog } from '@/lib/workers';
import { NextResponse } from 'next/server';

export async function GET() {
  const employees = await listWorkerCatalog();

  return NextResponse.json({
    success: true,
    employees,
  });
}
