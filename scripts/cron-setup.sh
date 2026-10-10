#!/bin/bash

# Script para configurar cron job que ejecuta worker-precios.mjs a las 4 PM (16:00) hora Colombia
# Uso: bash scripts/cron-setup.sh

set -e

echo "🔧 Configurando cron job para actualización automática de precios..."
echo ""

# Validar que worker-precios.mjs existe
if [ ! -f "worker-precios.mjs" ]; then
  echo "❌ Error: worker-precios.mjs no existe"
  exit 1
fi

# Detectar directorio del proyecto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_PATH="$PROJECT_DIR/worker-precios.mjs"
NODE_PATH="$(which node)"

if [ -z "$NODE_PATH" ]; then
  echo "❌ Error: node no encontrado en PATH"
  exit 1
fi

echo "📋 Información del cron:"
echo "  Proyecto: $PROJECT_DIR"
echo "  Worker: $WORKER_PATH"
echo "  Node: $NODE_PATH"
echo ""

# Convertir 4 PM a UTC-5 (hora Colombia)
# 4 PM = 16:00 UTC-5 = 21:00 UTC
HORA_UTC=21
MINUTO=00

echo "⏰ Programación:"
echo "  Hora ejecución (Colombia): 16:00 (4 PM)"
echo "  Hora UTC equivalente: ${HORA_UTC}:${MINUTO}"
echo "  Frecuencia: Diaria"
echo ""

# Crear entrada cron
# Formato: min hour day month dow command
CRON_ENTRY="${MINUTO} ${HORA_UTC} * * * cd $PROJECT_DIR && $NODE_PATH $WORKER_PATH >> $PROJECT_DIR/logs/cron-precios.log 2>&1"

echo "📝 Entrada cron que se añadirá:"
echo "  $CRON_ENTRY"
echo ""

# Verificar si ya existe
CURRENT_CRON=$(crontab -l 2>/dev/null | grep "worker-precios.mjs" || true)

if [ -n "$CURRENT_CRON" ]; then
  echo "⚠️  Ya existe una entrada cron para worker-precios.mjs:"
  echo "  $CURRENT_CRON"
  echo ""
  read -p "¿Deseas reemplazarla? (s/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "❌ Operación cancelada"
    exit 1
  fi
fi

# Crear directorio de logs si no existe
mkdir -p "$PROJECT_DIR/logs"

# Añadir/reemplazar entrada cron
(
  crontab -l 2>/dev/null | grep -v "worker-precios.mjs" || true
  echo "$CRON_ENTRY"
) | crontab -

echo ""
echo "✅ Cron job configurado exitosamente"
echo ""
echo "📊 Verifica la configuración:"
echo "  crontab -l | grep worker-precios"
echo ""
echo "📖 Ver logs de ejecución:"
echo "  tail -f $PROJECT_DIR/logs/cron-precios.log"
echo ""
echo "🛑 Para desactivar el cron:"
echo "  crontab -e  (y elimina la línea del worker-precios.mjs)"
