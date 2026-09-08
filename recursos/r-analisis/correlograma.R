# =============================================================================
# correlograma.R — correlograma de calidad de publicación con corrplot
#
# Entrada:  una matriz numérica M (filas = observaciones, columnas = variables;
#           pon los nombres "bonitos" en colnames(M)).
# Salida:   un PNG (elipses de correlación en el triángulo superior con
#           asteriscos de significancia, coeficientes numéricos en el inferior)
#           y una lista con la matriz de r (Pearson) y la de p-valores.
# Uso:
#   source("correlograma.R")
#   res <- guardar_correlograma(M, "correlograma.png", "Mi título")
#   res$r ; res$p
#
# Requiere: install.packages("corrplot")
# Nota: usa la familia tipográfica "Times New Roman"; si no la tienes instalada
#       R usará la de por defecto sin fallar. Cambia `familia` si quieres otra.
#
# Plantilla educativa adaptada de un pipeline real. NO es un procedimiento
# soportado paso a paso: léela y ajústala a tus datos antes de ejecutarla.
# =============================================================================

suppressPackageStartupMessages({ library(corrplot) })

# --- AJUSTA ESTO -------------------------------------------------------------
familia <- "Times New Roman"   # familia tipográfica; "sans" si no la tienes

# Umbral de p-valor a partir del cual una correlación se marca con asterisco.
# 0.05 es la convención habitual; usa 0.01 si quieres ser más estricto.
NIVEL_SIGNIFICANCIA <- 0.05

# Tamaño del PNG de salida. 2200x2200 a 300 dpi ≈ 7.3 pulgadas, suficiente para
# ~10-15 variables. Súbelo si tienes más y las etiquetas se amontonan.
ANCHO_PX <- 2200
ALTO_PX  <- 2200
RES_DPI  <- 300
# --------------------------------------------------------------------------

# Matriz de p-valores de la correlación de Pearson (todas las parejas)
mat_pvalores <- function(M) {
  n <- ncol(M)
  p <- matrix(NA, n, n, dimnames = list(colnames(M), colnames(M)))
  diag(p) <- 0
  for (i in seq_len(n - 1)) for (j in (i + 1):n) {
    p[i, j] <- p[j, i] <- cor.test(M[, i], M[, j])$p.value
  }
  p
}

# Genera el PNG y devuelve list(r = ..., p = ...)
guardar_correlograma <- function(M, ruta_png, titulo) {
  # "pairwise.complete.obs": cada correlación usa todas las parejas de datos
  # completos (así un NA en una variable no tira toda una fila).
  R <- cor(M, use = "pairwise.complete.obs")
  P <- mat_pvalores(M)

  # paleta divergente rojo-blanco-azul (para signo +/-; NO usar una secuencial)
  col_rb <- colorRampPalette(c("#B2182B", "#D6604D", "#F4A582", "#FDDBC7",
                               "#FFFFFF",
                               "#D1E5F0", "#92C5DE", "#4393C3", "#2166AC"))(200)

  png(ruta_png, width = ANCHO_PX, height = ALTO_PX, res = RES_DPI)
  par(family = familia)

  # triángulo superior: elipses + asteriscos de significancia
  corrplot(R, p.mat = P, sig.level = NIVEL_SIGNIFICANCIA, method = "ellipse", type = "upper",
           col = col_rb, tl.col = "black", tl.pos = "lt", tl.cex = 1.0,
           insig = "label_sig", pch.col = "grey15", pch.cex = 1.6,
           mar = c(0, 0, 2, 0))
  # triángulo inferior: solo el coeficiente numérico
  corrplot(R, add = TRUE, method = "number", type = "lower", diag = FALSE,
           col = col_rb, tl.pos = "n", cl.pos = "n", number.cex = 0.9)
  title(titulo, family = familia, font.main = 2, cex.main = 1.1)
  dev.off()

  list(r = R, p = P)
}
