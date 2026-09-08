# =============================================================================
# parse_qiime_ordination.R — lee un "ordination.txt" de QIIME 2 / scikit-bio
#
# Entrada:  la ruta a un archivo "ordination.txt" (lo produce
#           `qiime tools export` sobre un artefacto *_pcoa.qza; ver el script
#           09c_exportar_pcoa.sh del pipeline).
# Salida:   list(df, var) donde
#             df  = data.frame(SampleID, PC1, PC2)   -- coordenadas por muestra
#             var = c(pc1, pc2)                       -- % de varianza explicada
# Uso:
#   source("parse_qiime_ordination.R")
#   ord <- parse_qiime_ordination("bray_curtis/ordination.txt")
#   plot(ord$df$PC1, ord$df$PC2,
#        xlab = sprintf("PC1 (%.1f%%)", ord$var[1]),
#        ylab = sprintf("PC2 (%.1f%%)", ord$var[2]))
#
# Solo base R, sin dependencias. Coge PC1 y PC2; amplíalo si necesitas más ejes.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================

parse_qiime_ordination <- function(filepath) {
  lines <- readLines(filepath)

  # % de varianza explicada: la línea siguiente a "Proportion explained"
  prop_idx <- grep("^Proportion explained", lines)
  prop_vals <- as.numeric(strsplit(lines[prop_idx + 1], "\t")[[1]])
  pc1_var <- round(prop_vals[1] * 100, 2)
  pc2_var <- round(prop_vals[2] * 100, 2)

  # coordenadas: bloque que empieza tras "Site" y acaba en la primera línea vacía
  site_idx <- grep("^Site", lines)[1]
  empty_lines <- grep("^$", lines)
  end_idx <- empty_lines[empty_lines > site_idx][1] - 1
  if (is.na(end_idx)) end_idx <- length(lines)

  site_data <- read.table(text = lines[(site_idx + 1):end_idx],
                          sep = "\t", header = FALSE, row.names = 1)
  df_pcoa <- data.frame(SampleID = rownames(site_data),
                        PC1 = site_data[, 1], PC2 = site_data[, 2])

  list(df = df_pcoa, var = c(pc1_var, pc2_var))
}
