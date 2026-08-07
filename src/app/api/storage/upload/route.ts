import { uploadFile } from '@/storage';
import { StorageError } from '@/storage/types';
import { requireSameOrigin, requireSession } from '@/lib/api-security';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder') as string | null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (folder && (!/^[A-Za-z0-9/_-]{1,80}$/.test(folder) || folder.includes('..'))) {
      return NextResponse.json({ error: '文件夹路径无效' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds the 10MB limit' },
        { status: 400 }
      );
    }

    if (file.name.length > 200) {
      return NextResponse.json({ error: '文件名过长' }, { status: 400 });
    }

    // Validate file type (optional, based on your requirements)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not supported' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to storage
    const result = await uploadFile(
      buffer,
      file.name,
      file.type,
      folder || undefined
    );

    console.log('uploadFile, result', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error uploading file:', error);

    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Something went wrong while uploading the file' },
      { status: 500 }
    );
  }
}

// Increase the body size limit for file uploads (default is 4MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
