import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity()
export class ComputeValueJobResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "integer",
  })
  argA: number;

  @Column({
    type: "integer",
  })
  argB: number;

  @Column({ type: "integer", nullable: true })
  result: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
