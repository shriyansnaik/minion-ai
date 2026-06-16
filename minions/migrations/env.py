from alembic import context


def run_migrations() -> None:
    connectable = context.config.attributes.get("connection", None)

    if connectable is None:
        # CLI usage (alembic upgrade head from terminal)
        from sqlalchemy import engine_from_config, pool
        connectable = engine_from_config(
            context.config.get_section(context.config.config_ini_section),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )
        with connectable.connect() as connection:
            context.configure(connection=connection, target_metadata=None)
            with context.begin_transaction():
                context.run_migrations()
    else:
        # Python API usage (called from trace_db._run_migrations)
        context.configure(connection=connectable, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
