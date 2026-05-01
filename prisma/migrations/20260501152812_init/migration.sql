-- CreateTable
CREATE TABLE "public"."usuarios" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "telefone" TEXT,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "senha" TEXT NOT NULL,
    "saldoAtual" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "limiteCartao" DECIMAL(10,2),
    "limitePixDiario" DECIMAL(10,2),
    "limitePixMensal" DECIMAL(10,2),
    "scoreCredito" INTEGER NOT NULL DEFAULT 0,
    "numeroConta" TEXT,
    "digitoConta" TEXT,
    "agencia" TEXT,
    "isAtivo" BOOLEAN NOT NULL DEFAULT true,
    "isVerificado" BOOLEAN NOT NULL DEFAULT false,
    "tokenVerificacao" TEXT,
    "dataVerificacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."enderecos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "pais" TEXT NOT NULL DEFAULT 'Brasil',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dados_profissionais" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profissao" TEXT NOT NULL,
    "empresa" TEXT,
    "rendaMensal" DECIMAL(10,2),
    "tempoTrabalho" TEXT,
    "cargo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dados_profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."configuracoes_usuario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificacoesEmail" BOOLEAN NOT NULL DEFAULT true,
    "notificacoesSms" BOOLEAN NOT NULL DEFAULT true,
    "notificacoesPush" BOOLEAN NOT NULL DEFAULT true,
    "temaInterface" TEXT NOT NULL DEFAULT 'claro',
    "idioma" TEXT NOT NULL DEFAULT 'pt-BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cartoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maskedNumber" TEXT NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "validade" TEXT NOT NULL,
    "bandeira" TEXT NOT NULL,
    "cardToken" TEXT,
    "limite" DECIMAL(10,2) NOT NULL,
    "saldoUtilizado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tipo" TEXT NOT NULL DEFAULT 'credito',
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAprovacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cartoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emprestimos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "valorSolicitado" DECIMAL(10,2) NOT NULL,
    "valorAprovado" DECIMAL(10,2),
    "prazoMeses" INTEGER NOT NULL,
    "taxaJuros" DECIMAL(5,2) NOT NULL,
    "valorParcela" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAprovacao" TIMESTAMP(3),
    "dataQuitacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emprestimos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."movimentacoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "saldoAnterior" DECIMAL(10,2) NOT NULL,
    "saldoAtual" DECIMAL(10,2) NOT NULL,
    "categoria" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "dataMovimentacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notificacoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "isLida" BOOLEAN NOT NULL DEFAULT false,
    "dataEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transacoes_pix" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chavePix" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tipo" TEXT NOT NULL,
    "remetente" TEXT,
    "destinatario" TEXT,
    "idempotencyKey" TEXT,
    "providerReference" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'demo',
    "dataTransacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacoes_pix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chaves_pix" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtivacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chaves_pix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."boletos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codigoBarras" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "beneficiario" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "dataPagamento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boletos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pagamentos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "chavePix" TEXT,
    "codigoBarras" TEXT,
    "idempotencyKey" TEXT,
    "providerReference" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'demo',
    "dataPagamento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "isAtivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."afiliacoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "afiliadoId" TEXT NOT NULL,
    "comissao" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afiliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."campanhas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "orcamento" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."gamificacao_usuario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ranking" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gamificacao_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "public"."usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "public"."usuarios"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_numeroConta_key" ON "public"."usuarios"("numeroConta");

-- CreateIndex
CREATE UNIQUE INDEX "enderecos_userId_key" ON "public"."enderecos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dados_profissionais_userId_key" ON "public"."dados_profissionais"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_usuario_userId_key" ON "public"."configuracoes_usuario"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_cardToken_key" ON "public"."cartoes"("cardToken");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_idempotencyKey_key" ON "public"."movimentacoes"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_pix_idempotencyKey_key" ON "public"."transacoes_pix"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "chaves_pix_valor_key" ON "public"."chaves_pix"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "boletos_codigoBarras_key" ON "public"."boletos"("codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_idempotencyKey_key" ON "public"."pagamentos"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_tokenHash_key" ON "public"."tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "gamificacao_usuario_userId_key" ON "public"."gamificacao_usuario"("userId");

-- AddForeignKey
ALTER TABLE "public"."enderecos" ADD CONSTRAINT "enderecos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dados_profissionais" ADD CONSTRAINT "dados_profissionais_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."configuracoes_usuario" ADD CONSTRAINT "configuracoes_usuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cartoes" ADD CONSTRAINT "cartoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emprestimos" ADD CONSTRAINT "emprestimos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."movimentacoes" ADD CONSTRAINT "movimentacoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notificacoes" ADD CONSTRAINT "notificacoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transacoes_pix" ADD CONSTRAINT "transacoes_pix_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chaves_pix" ADD CONSTRAINT "chaves_pix_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."boletos" ADD CONSTRAINT "boletos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pagamentos" ADD CONSTRAINT "pagamentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tokens" ADD CONSTRAINT "tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."afiliacoes" ADD CONSTRAINT "afiliacoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."campanhas" ADD CONSTRAINT "campanhas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."gamificacao_usuario" ADD CONSTRAINT "gamificacao_usuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
