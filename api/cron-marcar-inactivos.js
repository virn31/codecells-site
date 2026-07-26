// api/cron-marcar-inactivos.js — CODE CELLS®
// Se ejecuta automáticamente vía Vercel Cron (ver vercel.json). Marca como
// "Inactivo" a los pacientes sin actividad en 6 meses — NUNCA borra nada.
// El expediente sigue completo y accesible, solo deja de aparecer como
// activo por defecto. Cumple con NOM-004-SSA3-2012 (conservación mínima
// de 5 años) al no eliminar información clínica bajo ninguna circunstancia.

const MESES_INACTIVIDAD = 6;

module.exports = async function handler(req, res) {
  // Protección simple: si CRON_SECRET está configurado en Vercel, se exige.
  // Si no está configurado, corre igual (para no bloquear el primer uso),
  // pero se recomienda configurarlo.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
  }

  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const BASE_ID = 'app6jyD9pDlTLpknA';
    const TBL_PAC = 'tblyUcCfueFLJuvIv';

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - MESES_INACTIVIDAD);

    let records = [];
    let offset = null;
    do {
      const url = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}?fields[]=C%C3%B3digo%20de%20paciente&fields[]=%C3%9Altima%20actividad&fields[]=Estado%20del%20expediente${offset ? `&offset=${offset}` : ''}`;
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const listData = await listRes.json();
      records = records.concat(listData.records || []);
      offset = listData.offset || null;
    } while (offset);

    const aMarcar = records.filter(r => {
      const ultima = r.fields['Última actividad'];
      const estado = r.fields['Estado del expediente'];
      if (estado === 'Inactivo') return false; // ya está marcado
      if (!ultima) return false; // sin fecha registrada — no se toca, no se adivina
      return new Date(ultima) < cutoff;
    });

    for (const r of aMarcar) {
      await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${r.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields: { 'Estado del expediente': 'Inactivo' } }),
      });
    }

    return res.status(200).json({
      ok: true,
      revisados: records.length,
      marcados_inactivos: aMarcar.map(r => r.fields['Código de paciente']),
    });
  } catch (err) {
    console.error('[cron-marcar-inactivos] error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
