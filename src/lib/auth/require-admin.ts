import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Garante que o request é de um admin autenticado.
 * Em caso de erro, retorna um NextResponse pronto; caso contrário, retorna null.
 *
 * Uso:
 *   const denied = await requireAdmin()
 *   if (denied) return denied
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: profile } = await userClient
    .schema('noticias')
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins' }, { status: 403 })
  }

  return null
}
