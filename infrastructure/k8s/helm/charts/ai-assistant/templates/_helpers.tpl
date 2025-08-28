{{- define "ai-assistant.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ai-assistant.fullname" -}}
{{- printf "%s" (include "ai-assistant.name" .) -}}
{{- end -}}

{{- define "ai-assistant.labels" -}}
app: {{ include "ai-assistant.fullname" . }}
chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
release: {{ .Release.Name }}
heritage: {{ .Release.Service }}
{{- end -}}

