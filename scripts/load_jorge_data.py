#!/usr/bin/env python3
"""
CARGAR DATOS DE JORGE TORRES + 4 PACIENTES FICTICIOS EN AIRTABLE

Uso:
  python3 load_jorge_data.py --token YOUR_AIRTABLE_TOKEN

Obtener token:
  1. Ir a https://airtable.com/create/tokens
  2. Crear Personal Access Token con permisos: data.records:create, data.records:read
  3. Copiar el token y pasarlo a este script
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from argparse import ArgumentParser

BASE_ID = "app6jyD9pDlTLpknA"
MEDICOS_TABLE = "tbl87DsuBMmb4DjFM"
PACIENTES_TABLE = "tblyUcCfueFLJuvIv"
HISTORIA_TABLE = "tblm2xUADazitHisR"
CONSULTAS_TABLE = "tbl1Xp2IGxdV178Ky"

class AirtableLoader:
    def __init__(self, token):
        self.token = token
        self.base_url = f"https://api.airtable.com/v0/{BASE_ID}"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        self.medico_ids = {}  # Cache de médicos por código
    
    def crear_medico(self, codigo, nombre, especialidad, nivel="Certificado"):
        """Crear médico en MÉDICOS"""
        print(f"  → Creando médico: {nombre} ({codigo})")
        
        data = {
            "records": [{
                "fields": {
                    "Código de médico": codigo,
                    "Nombre completo": nombre,
                    "Especialidad": especialidad,
                    "Nivel CODE CELLS®": nivel,
                    "Activo": True
                }
            }]
        }
        
        resp = requests.post(
            f"{self.base_url}/{MEDICOS_TABLE}",
            headers=self.headers,
            json=data
        )
        
        if resp.status_code == 200:
            medico_id = resp.json()["records"][0]["id"]
            self.medico_ids[codigo] = medico_id
            print(f"    ✓ Médico creado: {medico_id}")
            return medico_id
        else:
            print(f"    ✗ Error: {resp.status_code} - {resp.text}")
            return None
    
    def crear_paciente(self, codigo, nombre, edad, sexo, email, telefono, medico_codigo):
        """Crear paciente en PACIENTES"""
        print(f"  → Creando paciente: {nombre} ({codigo})")
        
        medico_id = self.medico_ids.get(medico_codigo)
        if not medico_id:
            print(f"    ✗ Médico {medico_codigo} no encontrado")
            return None
        
        data = {
            "records": [{
                "fields": {
                    "Código de paciente": codigo,
                    "Nombre completo": nombre,
                    "Edad": edad,
                    "Sexo": sexo,
                    "Email": email,
                    "Teléfono": telefono,
                    "Médico principal": [medico_id],
                    "Estatus": "Activo"
                }
            }]
        }
        
        resp = requests.post(
            f"{self.base_url}/{PACIENTES_TABLE}",
            headers=self.headers,
            json=data
        )
        
        if resp.status_code == 200:
            paciente_id = resp.json()["records"][0]["id"]
            print(f"    ✓ Paciente creado: {paciente_id}")
            return paciente_id
        else:
            print(f"    ✗ Error: {resp.status_code} - {resp.text}")
            return None
    
    def crear_historia_clinica(self, paciente_id, antecedentes, alergias, medicamentos):
        """Crear historia clínica"""
        print(f"      → Creando historia clínica...")
        
        data = {
            "records": [{
                "fields": {
                    "Paciente": [paciente_id],
                    "Antecedentes personales": antecedentes,
                    "Alergias conocidas": alergias,
                    "Medicamentos actuales": medicamentos,
                    "Activo": True
                }
            }]
        }
        
        resp = requests.post(
            f"{self.base_url}/{HISTORIA_TABLE}",
            headers=self.headers,
            json=data
        )
        
        if resp.status_code == 200:
            historia_id = resp.json()["records"][0]["id"]
            print(f"        ✓ Historia clínica creada")
            return historia_id
        else:
            print(f"        ✗ Error: {resp.status_code}")
            return None
    
    def crear_consulta(self, paciente_id, medico_id, medico_codigo, motivo, diagnostico):
        """Crear consulta de seguimiento"""
        fecha_consulta = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
        proxima_cita = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
        
        data = {
            "records": [{
                "fields": {
                    "Código de paciente": [paciente_id],
                    "Médico": [medico_id],
                    "Código de médico ref": medico_codigo,
                    "Fecha de consulta": fecha_consulta,
                    "Tipo de consulta": "Seguimiento",
                    "Motivo de consulta": motivo,
                    "Diagnóstico (CIE-10)": diagnostico,
                    "Plan terapéutico": "Plan de tratamiento CODE CELLS™ — Seguimiento en protocolo vigente",
                    "Estado del protocolo": "Activo",
                    "Exploración física": "General: Estable. Sin alteraciones relevantes.",
                    "Próxima cita": proxima_cita,
                    "Firma / Cédula médico": medico_codigo
                }
            }]
        }
        
        resp = requests.post(
            f"{self.base_url}/{CONSULTAS_TABLE}",
            headers=self.headers,
            json=data
        )
        
        if resp.status_code == 200:
            print(f"        ✓ Consulta creada")
            return True
        else:
            print(f"        ✗ Error: {resp.status_code}")
            return False

def main():
    parser = ArgumentParser(description="Cargar datos de Jorge Torres en Airtable")
    parser.add_argument("--token", required=True, help="Token de Airtable Personal Access")
    args = parser.parse_args()
    
    loader = AirtableLoader(args.token)
    
    print("\n" + "="*70)
    print(" CARGANDO DATOS: Jorge Torres (CEO Regene) + 4 Pacientes Ficticios")
    print("="*70 + "\n")
    
    # PASO 1: Crear médicos
    print("\n[PASO 1] Creando médicos...")
    victor_id = loader.crear_medico(
        "CCMED-VIRN01",
        "Dr. Víctor Iván Rodríguez Nava",
        "Medicina Regenerativa"
    )
    
    galvan_id = loader.crear_medico(
        "CCMED-JCG01",
        "Dr. Juan Carlos Galván López",
        "Medicina Regenerativa"
    )
    
    jorge_id = loader.crear_medico(
        "CCMED-JORGE01",
        "Jorge Torres",
        "CEO Regene Global",
        "Consultivo"
    )
    
    if not all([victor_id, galvan_id, jorge_id]):
        print("\n✗ Error crítico: No se pudieron crear los médicos")
        return False
    
    print("\n✓ Médicos creados exitosamente\n")
    
    # PASO 2: Crear 4 pacientes con históricos completos
    pacientes_data = [
        {
            "codigo": "CC-PAC-001",
            "nombre": "María García López",
            "edad": 45,
            "sexo": "Femenino",
            "email": "maria.garcia@example.com",
            "telefono": "6671234567",
            "medico": "CCMED-VIRN01",
            "antecedentes": "Hipertensión controlada desde hace 8 años. Antecedentes familiares de diabetes tipo 2. Sedentarismo leve.",
            "alergias": "Penicilina",
            "medicamentos": "Losartán 50mg diarios",
            "motivo": "Seguimiento de hipertensión y fatiga persistente",
            "diagnostico": "I10 (Hipertensión esencial)"
        },
        {
            "codigo": "CC-PAC-002",
            "nombre": "Carlos Rodríguez Martínez",
            "edad": 52,
            "sexo": "Masculino",
            "email": "carlos.rodriguez@example.com",
            "telefono": "6671234568",
            "medico": "CCMED-JCG01",
            "antecedentes": "Sobrepeso (IMC 29). Sedentarismo. Estrés laboral crónico. Dorsal lumbar hiperlordótica.",
            "alergias": "Ninguna conocida",
            "medicamentos": "Ninguno",
            "motivo": "Dolor de espalda crónico y mala circulación linfática",
            "diagnostico": "M54.5 (Dolor de espalda bajo)"
        },
        {
            "codigo": "CC-PAC-003",
            "nombre": "Ana Fernández González",
            "edad": 38,
            "sexo": "Femenino",
            "email": "ana.fernandez@example.com",
            "telefono": "6671234569",
            "medico": "CCMED-VIRN01",
            "antecedentes": "Ciclos menstruales irregulares desde los 35 años. Anemia leve. Post-lipoaspiración 2 meses.",
            "alergias": "Sulfonamidas",
            "medicamentos": "Suplemento de hierro elemental 325mg diarios",
            "motivo": "Regeneración celular post-lipoaspiración y restauración de energía",
            "diagnostico": "E61.7 (Deficiencia de hierro)"
        },
        {
            "codigo": "CC-PAC-004",
            "nombre": "Diego Sánchez Iglesias",
            "edad": 55,
            "sexo": "Masculino",
            "email": "diego.sanchez@example.com",
            "telefono": "6671234570",
            "medico": "CCMED-JCG01",
            "antecedentes": "Diabetes tipo 2 desde hace 12 años. Obesidad (IMC 31). Sedentarismo extremo. Neuropatía diabética leve.",
            "alergias": "AINE",
            "medicamentos": "Metformina 850mg x2 diarias, Lisinopril 10mg diarios",
            "motivo": "Control de diabetes mellitus y regeneración de tejidos periféricos",
            "diagnostico": "E11.9 (Diabetes mellitus tipo 2 sin complicaciones)"
        }
    ]
    
    print("[PASO 2] Creando 4 pacientes ficticios con expedientes completos...\n")
    
    for pac_data in pacientes_data:
        print(f"\n--- PACIENTE: {pac_data['nombre']} ---")
        
        # Crear paciente
        paciente_id = loader.crear_paciente(
            pac_data['codigo'],
            pac_data['nombre'],
            pac_data['edad'],
            pac_data['sexo'],
            pac_data['email'],
            pac_data['telefono'],
            pac_data['medico']
        )
        
        if not paciente_id:
            continue
        
        # Crear historia clínica
        loader.crear_historia_clinica(
            paciente_id,
            pac_data['antecedentes'],
            pac_data['alergias'],
            pac_data['medicamentos']
        )
        
        # Crear 2 consultas de seguimiento
        medico_id = loader.medico_ids[pac_data['medico']]
        for i in range(2):
            loader.crear_consulta(
                paciente_id,
                medico_id,
                pac_data['medico'],
                pac_data['motivo'],
                pac_data['diagnostico']
            )
    
    print("\n" + "="*70)
    print(" ✓ DATOS CARGADOS EXITOSAMENTE")
    print("="*70)
    print("""
INFORMACIÓN DE JORGE TORRES:
  Código: CCMED-JORGE01
  Nombre: Jorge Torres
  Rol: CEO de Regene Global
  Nivel: Consultivo
  Acceso: Lectura completa de red médica, protocolos, outcomes
  
PRÓXIMOS PASOS:
  1. Generar token de sesión para Jorge en portal-medico.html
  2. Testar NOVA con código CCMED-JORGE01
  3. Validar acceso a los 4 pacientes ficticios
  
CONTACTO:
  Jorge puede conectar directo con:
  - Víctor Rodríguez (CCMED-VIRN01)
  - Juan Carlos Galván (CCMED-JCG01)
    """)
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n✗ Operación cancelada")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        sys.exit(1)
